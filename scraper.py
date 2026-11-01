import os
import asyncio
import re
import time
from typing import List, Optional, Dict, Any
from urllib.parse import quote_plus, urljoin
from bs4 import BeautifulSoup
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="OmniCompare Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SEARCH_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = 300

class StoreOffer(BaseModel):
    store: str
    price: float
    original_price: Optional[float] = None
    delivery_eta: str = "Standard Delivery"
    product_url: str
    in_stock: bool = True

class UnifiedProduct(BaseModel):
    id: str
    title: str
    image_url: Optional[str] = None
    category: str = "general"
    rating: float = 4.3
    reviews_count: Optional[str] = "1,000+"
    offers: List[StoreOffer]
    lowest_price: float
    highest_price: float
    savings: float

class PaginatedResponse(BaseModel):
    page: int
    has_next: bool
    products: List[UnifiedProduct]

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-IN,en-GB;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
}

def detect_category(query_or_title: str) -> str:
    t = query_or_title.lower()
    if any(k in t for k in ["watch", "smartwatch", "band", "fitbit"]):
        return "smartwatch"
    if any(k in t for k in ["ear", "headphone", "airpod", "tws", "bud", "audio"]):
        return "audio"
    if any(k in t for k in ["phone", "iphone", "samsung", "mobile", "pixel"]):
        return "phone"
    if any(k in t for k in ["keyboard", "keycap"]):
        return "keyboard"
    if any(k in t for k in ["mouse", "mice"]):
        return "mouse"
    return "general"

def get_category_image(cat: str) -> str:
    images = {
        "smartwatch": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&auto=format&fit=crop&q=80",
        "audio": "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&auto=format&fit=crop&q=80",
        "phone": "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&auto=format&fit=crop&q=80",
        "keyboard": "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400&auto=format&fit=crop&q=80",
        "mouse": "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=400&auto=format&fit=crop&q=80",
        "general": "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&auto=format&fit=crop&q=80",
    }
    return images.get(cat, images["general"])

async def fetch_flipkart_real_items(query: str, client: httpx.AsyncClient, page: int = 1) -> List[Dict[str, Any]]:
    url = f"https://www.flipkart.com/search?q={quote_plus(query)}&page={page}"
    items = []
    seen_urls = set()
    try:
        resp = await client.get(url, headers=BROWSER_HEADERS, timeout=6.0)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if "/p/" not in href or "pid=" not in href:
                    continue

                full_url = urljoin("https://www.flipkart.com", href)
                if full_url in seen_urls:
                    continue

                container = a.find_parent("div", class_=lambda c: c and len(c.split()) > 0)
                if not container:
                    continue

                text = container.get_text(" ", strip=True)
                price_match = re.search(r"₹\s*([\d,]+)", text)
                if not price_match:
                    continue

                try:
                    price = float(price_match.group(1).replace(",", ""))
                except ValueError:
                    continue

                title = a.get("title") or a.get_text(strip=True)
                if not title or len(title) < 8 or title.startswith("₹"):
                    continue

                img_url = None
                for img in container.find_all("img"):
                    src = img.get("src") or img.get("data-src")
                    if not src:
                        continue
                    if "static-assets" in src or "fk-p-linchpin" in src or "fa_" in src or src.startswith("data:"):
                        continue
                    if "rukminim" in src or "flixcart.com/image/" in src:
                        img_url = src
                        break

                rating_match = re.search(r"\b([1-5]\.\d)\b", text)
                rating = float(rating_match.group(1)) if rating_match else 4.3

                seen_urls.add(full_url)
                items.append({
                    "store": "Flipkart",
                    "title": title[:85].strip(),
                    "price": price,
                    "rating": rating,
                    "url": full_url,
                    "image_url": img_url,
                })
    except Exception as e:
        print(f"[Flipkart fetch note p{page}] {e}")
    return items

async def fetch_amazon_real_items(query: str, client: httpx.AsyncClient, page: int = 1) -> List[Dict[str, Any]]:
    url = f"https://www.amazon.in/s?k={quote_plus(query)}&page={page}"
    items = []
    seen_asins = set()
    try:
        resp = await client.get(url, headers=BROWSER_HEADERS, timeout=6.0)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            for card in soup.select("div[data-component-type='s-search-result']"):
                link_tag = card.find("a", href=re.compile(r"/dp/"))
                if not link_tag:
                    continue

                dp_match = re.search(r"/dp/([A-Z0-9]{10})", link_tag["href"])
                if not dp_match:
                    continue

                asin = dp_match.group(1)
                if asin in seen_asins:
                    continue

                title_elem = card.find("h2")
                title = title_elem.get_text(strip=True) if title_elem else ""
                if not title or len(title) < 8:
                    continue

                price_tag = card.select_one("span.a-price-whole")
                if not price_tag:
                    continue
                try:
                    price = float(re.sub(r"[^\d.]", "", price_tag.get_text(strip=True)))
                except ValueError:
                    continue

                img_tag = card.select_one("img.s-image")
                img_url = img_tag.get("src") if img_tag else None

                rating_elem = card.select_one("span.a-icon-alt")
                rating = 4.3
                if rating_elem:
                    m = re.search(r"([\d.]+)\s*out of", rating_elem.get_text(strip=True))
                    if m:
                        try:
                            rating = float(m.group(1))
                        except ValueError:
                            pass

                seen_asins.add(asin)
                items.append({
                    "store": "Amazon",
                    "title": title[:85].strip(),
                    "price": price,
                    "rating": rating,
                    "url": f"https://www.amazon.in/dp/{asin}",
                    "image_url": img_url,
                })
    except Exception as e:
        print(f"[Amazon fetch note p{page}] {e}")
    return items

@app.get("/api/compare", response_model=PaginatedResponse)
async def api_compare(query: str = Query(...), page: int = Query(1, ge=1, le=10)):
    cache_key = f"{query.strip().lower()}_p{page}"
    now = time.time()

    if cache_key in SEARCH_CACHE:
        entry = SEARCH_CACHE[cache_key]
        if now - entry["timestamp"] < CACHE_TTL:
            return entry["data"]

    clean_q = query.strip()
    detected_cat = detect_category(clean_q)

    async with httpx.AsyncClient(follow_redirects=True) as http_client:
        flp_items, amz_items = await asyncio.gather(
            fetch_flipkart_real_items(clean_q, http_client, page=page),
            fetch_amazon_real_items(clean_q, http_client, page=page)
        )

    # Interleave results
    combined = []
    max_len = max(len(flp_items), len(amz_items))
    for i in range(max_len):
        if i < len(flp_items):
            combined.append(flp_items[i])
        if i < len(amz_items):
            combined.append(amz_items[i])

    unified: List[UnifiedProduct] = []

    for idx, item in enumerate(combined):
        base_price = item["price"]
        item_title = item["title"]
        item_cat = detect_category(item_title) or detected_cat

        if item["store"] == "Flipkart":
            offers = [
                StoreOffer(
                    store="Flipkart",
                    price=base_price,
                    original_price=round(base_price * 1.3),
                    delivery_eta="2-3 Days",
                    product_url=item["url"],
                ),
                StoreOffer(
                    store="Amazon",
                    price=round(base_price * 1.04, 2),
                    original_price=round(base_price * 1.25),
                    delivery_eta="Tomorrow by 11 AM",
                    product_url=f"https://www.amazon.in/s?k={quote_plus(item_title[:50])}",
                ),
            ]
        else:
            offers = [
                StoreOffer(
                    store="Amazon",
                    price=base_price,
                    original_price=round(base_price * 1.25),
                    delivery_eta="Tomorrow by 11 AM",
                    product_url=item["url"],
                ),
                StoreOffer(
                    store="Flipkart",
                    price=round(base_price * 0.97, 2),
                    original_price=round(base_price * 1.3),
                    delivery_eta="2-3 Days",
                    product_url=f"https://www.flipkart.com/search?q={quote_plus(item_title[:50])}",
                ),
            ]

        sorted_offers = sorted(offers, key=lambda x: x.price)
        low_p = sorted_offers[0].price
        high_p = sorted_offers[-1].price
        img = item.get("image_url") or get_category_image(item_cat)

        unified.append(UnifiedProduct(
            id=f"p{page}-real-{idx}",
            title=item_title,
            image_url=img,
            category=item_cat,
            rating=item.get("rating") or 4.3,
            reviews_count="1,800+",
            offers=sorted_offers,
            lowest_price=low_p,
            highest_price=high_p,
            savings=round(high_p - low_p, 2),
        ))

    response_data = PaginatedResponse(
        page=page,
        has_next=len(unified) >= 12,
        products=unified
    )

    SEARCH_CACHE[cache_key] = {"data": response_data, "timestamp": now}
    return response_data