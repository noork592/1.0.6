"""Disguised email templates.

- OTP login emails look like a prize-contest win; the "ticket number" IS the OTP.
  A different prize theme is used each time (never the same twice in a row).
- Daily backup emails look like an ordinary shopping-offers newsletter; the
  backup ZIP is attached as an "offers catalogue".
"""
import random
from datetime import datetime
from typing import Dict, Tuple

_IMG = "https://static.prod-images.emergentagent.com/jobs/b45d60d0-4502-462d-9f9d-47ce7850aa70/images/"

PRIZE_THEMES = [
    {
        "key": "trophy", "banner": _IMG + "5f02786bd03737cfad202aabb71a81d12f75a14dddaa7d3b2231860d8d4e00cb.jpeg",
        "subject": "🎉 Congratulations! You've WON the Mega Lucky Draw 🏆",
        "title": "Congratulations, Winner!", "icons": "🎉 🏆 🎉",
        "intro": "You have been selected as a lucky winner of this week's <b>Mega Lucky Draw</b>! 🥳",
        "label": "YOUR LUCKY DRAW TICKET NUMBER", "team": "The Lucky Draw Team 🍀",
        "perks": [("🎁", "Exciting Gifts"), ("💰", "Cash Rewards"), ("🛍️", "Shopping Vouchers")],
        "c": {"bg": "#fff7ed", "main": "#b45309", "accent": "#f59e0b", "soft": "#fffbeb", "border": "#fed7aa"},
    },
    {
        "key": "car", "banner": _IMG + "b04d7d4bd6762c09524ef381c6ffe3b32f172f52edc2a95f9498b6ce812af715.jpeg",
        "subject": "🚗 You're a WINNER in the Dream Car Bumper Draw! 🎊",
        "title": "Your Dream Ride Awaits!", "icons": "🚗 🎊 🔑",
        "intro": "Great news! Your entry has been picked in our <b>Dream Car Bumper Draw</b>. 🏁",
        "label": "YOUR BUMPER DRAW COUPON NUMBER", "team": "The Bumper Draw Team 🚘",
        "perks": [("🚗", "Brand New Car"), ("⛽", "Free Fuel Card"), ("🛡️", "1 Year Insurance")],
        "c": {"bg": "#eff6ff", "main": "#1d4ed8", "accent": "#3b82f6", "soft": "#eff6ff", "border": "#bfdbfe"},
    },
    {
        "key": "travel", "banner": _IMG + "9eebbd234780b070d4f719458c8cb05a0a7c3374401b2977d16d91b60430f8bc.jpeg",
        "subject": "✈️ Pack Your Bags! You've Won a Holiday Getaway 🌴",
        "title": "Your Holiday Is Calling!", "icons": "✈️ 🌴 🏖️",
        "intro": "Hooray! You are a lucky winner of our <b>Summer Holiday Giveaway</b>. 🌞",
        "label": "YOUR HOLIDAY VOUCHER NUMBER", "team": "The Holiday Giveaway Team 🌺",
        "perks": [("✈️", "Return Flights"), ("🏨", "5-Star Stay"), ("🍹", "Free Meals")],
        "c": {"bg": "#ecfeff", "main": "#0e7490", "accent": "#06b6d4", "soft": "#ecfeff", "border": "#a5f3fc"},
    },
    {
        "key": "gadgets", "banner": _IMG + "f932c5051fe6ea4c51168291321195db96142ec26d6ced758f7bc4d55dc6ff7d.jpeg",
        "subject": "📱 Lucky You! You've Won the Gadget Mega Giveaway 🎁",
        "title": "Gadget Bonanza Winner!", "icons": "📱 🎧 💻",
        "intro": "Your entry was selected in our <b>Gadget Mega Giveaway</b>. Latest tech is coming your way! 🤩",
        "label": "YOUR GIVEAWAY ENTRY NUMBER", "team": "The Giveaway Team 💜",
        "perks": [("📱", "Smartphone"), ("🎧", "Headphones"), ("⌚", "Smartwatch")],
        "c": {"bg": "#faf5ff", "main": "#7e22ce", "accent": "#a855f7", "soft": "#faf5ff", "border": "#e9d5ff"},
    },
    {
        "key": "gold", "banner": _IMG + "6e57ffdcd0d55c95851100ec1a4afdd5506d806f1715a21a0afd5ce064c7fd6a.jpeg",
        "subject": "🪔 Festive Jackpot! You've Won the Golden Bumper Prize ✨",
        "title": "Festive Jackpot Winner!", "icons": "🪔 🪙 ✨",
        "intro": "Shubh Labh! You are a winner of our <b>Golden Festive Jackpot</b>. 🌼",
        "label": "YOUR JACKPOT TICKET NUMBER", "team": "The Festive Jackpot Team 🪔",
        "perks": [("🪙", "Gold Coins"), ("💵", "Cash Prize"), ("🎁", "Festive Hamper")],
        "c": {"bg": "#fff7ed", "main": "#c2410c", "accent": "#ea580c", "soft": "#fff7ed", "border": "#fdba74"},
    },
]

_last_theme_key = None


def _pick_theme() -> Dict:
    global _last_theme_key
    choices = [t for t in PRIZE_THEMES if t["key"] != _last_theme_key] or PRIZE_THEMES
    theme = random.choice(choices)
    _last_theme_key = theme["key"]
    return theme


def build_otp_email(code: str) -> Tuple[str, str, str]:
    """Returns (subject, plain_text, html) using a rotating prize theme."""
    t = _pick_theme()
    c = t["c"]
    import re
    intro_plain = re.sub(r"<[^>]+>", "", t["intro"])
    team_plain = t["team"]
    plain = (
        f"{t['icons']}  {t['title']}\n\n{intro_plain}\n\n"
        f"🎟️ {t['label'].title()}: {code}\n\n"
        "🎁 Keep this number safe to claim your prize.\n\n"
        f"Best wishes,\n{team_plain}"
    )
    perks = "".join(
        f'<td style="text-align:center;padding:8px;font-size:13px;color:#4b5563">{e}<br/>{n}</td>'
        for e, n in t["perks"]
    )
    html = f"""\
<div style="background:{c['bg']};padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
 <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.10);border:1px solid {c['border']}">
  <img src="{t['banner']}" alt="{t['title']}" width="520" style="display:block;width:100%;height:auto;border:0"/>
  <div style="padding:28px 28px 8px;text-align:center">
   <div style="font-size:30px;line-height:1">{t['icons']}</div>
   <h1 style="margin:12px 0 6px;font-size:26px;color:{c['main']}">{t['title']}</h1>
   <p style="margin:0;font-size:15px;color:#374151;line-height:1.6">{t['intro']}</p>
  </div>
  <div style="margin:20px 28px;border:2px dashed {c['accent']};border-radius:14px;background:{c['soft']};padding:20px;text-align:center">
   <div style="font-size:12px;letter-spacing:3px;color:{c['main']};font-weight:bold">🎟️ {t['label']}</div>
   <div style="font-size:38px;font-weight:bold;letter-spacing:10px;color:#111827;margin-top:10px;font-family:'Courier New',monospace">{code}</div>
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:0 28px"><tr>{perks}</tr></table>
  <div style="padding:16px 28px 28px">
   <p style="margin:0 0 14px;font-size:13px;color:#6b7280;line-height:1.6">✨ Keep this number safe to claim your prize. Please do not share it with anyone.</p>
   <p style="margin:0;font-size:14px;color:#1f2937">Best wishes,<br/><b>{t['team']}</b></p>
  </div>
  <div style="background:{c['accent']};color:#ffffff;text-align:center;font-size:12px;padding:10px">🌟 Thank you for being a valued member 🌟</div>
 </div>
</div>"""
    return t["subject"], plain, html


NEWSLETTER_BANNER = _IMG + "c800e751f77d0e519d54f27052d8a99651202f3490ae1721e455c84ec5ab6fc6.jpeg"

_DEALS = [
    ("👟", "Sneakers", "Up to 60% off"), ("👜", "Handbags", "Flat 40% off"),
    ("🕶️", "Sunglasses", "Buy 1 Get 1"), ("⌚", "Watches", "From ₹999"),
    ("👗", "Ethnic Wear", "Min. 50% off"), ("🎧", "Audio", "Up to 70% off"),
    ("🏠", "Home Decor", "Starting ₹199"), ("💄", "Beauty", "Extra 25% off"),
]


def build_backup_email(now: datetime) -> Tuple[str, str, str, str]:
    """Returns (subject, plain_text, html, attachment_filename) for the daily
    backup, disguised as a shopping newsletter."""
    date_str = now.strftime("%d %b %Y")
    deals = random.sample(_DEALS, 3)
    subject = random.choice([
        f"🛍️ Today's Hot Deals Are Here — {date_str}",
        f"🔥 Flash Sale Alert: Up to 70% Off — {date_str}",
        f"✨ Your Daily Style Picks & Offers — {date_str}",
        f"🎁 Weekend Bonanza Starts Now — {date_str}",
    ])
    filename = f"Offers-Catalogue-{now.strftime('%Y%m%d-%H%M%S')}.zip"
    plain = (
        f"Hello Shopper! 👋\n\nHere are today's handpicked offers ({date_str}):\n\n"
        + "\n".join(f"{e} {n} — {o}" for e, n, o in deals)
        + "\n\n📎 The full offers catalogue is attached.\n\nHappy Shopping!\nThe Style Deals Team 🛒"
    )
    cards = "".join(
        f'<td width="33%" style="padding:6px"><div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:12px;padding:14px 6px;text-align:center">'
        f'<div style="font-size:28px">{e}</div><div style="font-size:14px;font-weight:bold;color:#1f2937;margin-top:6px">{n}</div>'
        f'<div style="font-size:12px;color:#db2777;font-weight:bold;margin-top:4px">{o}</div></div></td>'
        for e, n, o in deals
    )
    html = f"""\
<div style="background:#f0fdfa;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
 <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.08);border:1px solid #ccfbf1">
  <div style="background:#0f766e;color:#ffffff;padding:14px 24px;font-size:18px;font-weight:bold;letter-spacing:1px">🛒 Style Deals <span style="float:right;font-size:12px;font-weight:normal;opacity:.85;padding-top:4px">{date_str}</span></div>
  <img src="{NEWSLETTER_BANNER}" alt="Today's Offers" width="560" style="display:block;width:100%;height:auto;border:0"/>
  <div style="padding:24px 24px 8px;text-align:center">
   <h1 style="margin:0 0 8px;font-size:24px;color:#0f766e">Hello Shopper! 👋</h1>
   <p style="margin:0;font-size:15px;color:#374151;line-height:1.6">Today's handpicked offers are live. Grab them before they're gone! 🔥</p>
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:12px 18px"><tr>{cards}</tr></table>
  <div style="margin:8px 24px 20px;background:#fefce8;border:1px dashed #facc15;border-radius:12px;padding:14px;text-align:center;font-size:14px;color:#854d0e">
   📎 Our <b>full offers catalogue</b> is attached to this email.
  </div>
  <div style="padding:0 24px 24px;font-size:14px;color:#1f2937">Happy Shopping!<br/><b>The Style Deals Team</b> 🛍️</div>
  <div style="background:#f1f5f9;color:#64748b;text-align:center;font-size:11px;padding:12px">You are receiving this because you subscribed to Style Deals updates.</div>
 </div>
</div>"""
    return subject, plain, html, filename
