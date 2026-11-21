"""8.7 對照圖：同一個位置 base｜a｜b 並排，上方一列標籤。python3 stitch.py <截圖資料夾> [輸出資料夾]"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent)
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).parent)
COLS = [("base", "改之前（8.6）"), ("a", "a 細軌"), ("b", "b 月台")]
POS = {"02": "從頂埔出發", "09": "台北車站往東", "03": "停靠永寧", "overview": "全景（沒搭乘）"}
GAP, HEAD = 24, 96
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

for pos, title in POS.items():
    imgs = [Image.open(SRC / f"{k}-{pos}.png").convert("RGB") for k, _ in COLS]
    w, h = imgs[0].size
    sheet = Image.new("RGB", (w * len(imgs) + GAP * (len(imgs) + 1), h + HEAD + GAP), (246, 242, 234))
    d = ImageDraw.Draw(sheet)
    big = ImageFont.truetype(FONT, 40)
    small = ImageFont.truetype(FONT, 28)
    for i, (img, (_, label)) in enumerate(zip(imgs, COLS)):
        x = GAP + i * (w + GAP)
        sheet.paste(img, (x, HEAD))
        d.text((x + 8, 18), label, font=big, fill=(27, 32, 51))
    d.text((sheet.width - GAP - d.textlength(title, font=small), 28), title, font=small, fill=(88, 96, 121))
    sheet.save(OUT / f"compare-{pos}.png", optimize=True)
    print(OUT / f"compare-{pos}.png", sheet.size)
