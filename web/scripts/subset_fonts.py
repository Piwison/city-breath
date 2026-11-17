"""分享圖的數字與英文字型（3.15，決定 19）：把 @fontsource/manrope 的 latin 子集再裁成基本拉丁、數字與幾個標點，
放進 web/public/fonts/（不向外部網址載入，AD-1）。授權 SIL OFL 1.1，全文一起複製成 OFL.txt。

在 web/ 底下 `npm ci` 之後跑：
    uv run --with "fonttools[woff]" python scripts/subset_fonts.py
"""

from pathlib import Path
import shutil

from fontTools import subset

WEB = Path(__file__).resolve().parent.parent
SRC = WEB / "node_modules" / "@fontsource" / "manrope"
OUT = WEB / "public" / "fonts"

# 基本拉丁（含數字）、不斷行空白、間隔號、乘號、破折號、引號、刪節號；中文一律交給系統字型
UNICODES = "U+0020-007E,U+00A0,U+00B7,U+00D7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026"

OUT.mkdir(parents=True, exist_ok=True)
for weight in (400, 700):
    src = SRC / "files" / f"manrope-latin-{weight}-normal.woff2"
    dst = OUT / f"manrope-num-{weight}.woff2"
    subset.main(
        [
            str(src),
            f"--unicodes={UNICODES}",
            "--layout-features=kern,tnum,lnum,liga",
            "--flavor=woff2",
            f"--output-file={dst}",
        ]
    )
    print(dst, dst.stat().st_size, "bytes")
shutil.copyfile(SRC / "LICENSE", OUT / "OFL.txt")
