"""Build Jike asset bundle.

Reusable: run `python docs/marketing/jike-assets/_build.py` from repo root
to regenerate compressed GIF, Day 6 architecture diagram, Day 7 grid,
and placeholder cards for the screenshots you still need to capture.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageSequence

ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "docs" / "marketing" / "jike-assets"
SHOTS = ROOT / "docs" / "screenshots"
SRC_GIF = ROOT / "docs" / "assets" / "yinjie-core-loop.gif"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Find a CJK-capable font on Windows; fall back to default."""
    candidates = [
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def compress_gif(target_kb: int = 780) -> Path:
    """Compress the 1.3MB core-loop gif to under target_kb by resizing+frame skip."""
    out = ASSETS / "day2" / "01-core-loop.gif"
    out.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(SRC_GIF)
    frames = [f.copy() for f in ImageSequence.Iterator(im)]
    duration = im.info.get("duration", 80)
    loop = im.info.get("loop", 0)

    # try shrinking with progressively smaller width + frame skip
    for scale, step in [(0.75, 1), (0.6, 1), (0.55, 2), (0.5, 2), (0.45, 2), (0.4, 3)]:
        w, h = im.size
        nw, nh = int(w * scale), int(h * scale)
        out_frames = []
        for i, fr in enumerate(frames):
            if i % step != 0:
                continue
            out_frames.append(fr.convert("RGBA").resize((nw, nh), Image.LANCZOS).convert("P", palette=Image.ADAPTIVE, colors=128))
        if not out_frames:
            continue
        out_frames[0].save(
            out,
            save_all=True,
            append_images=out_frames[1:],
            duration=duration * step,
            loop=loop,
            optimize=True,
            disposal=2,
        )
        size_kb = out.stat().st_size / 1024
        print(f"  try scale={scale} step={step} -> {size_kb:.0f} KB ({nw}x{nh}, {len(out_frames)} frames)")
        if size_kb <= target_kb:
            return out
    return out


def grid_2x3() -> Path:
    """6-up grid: 2 columns x 3 rows of the core screenshots."""
    files = [
        "core-onboarding.png",
        "core-moments.png",
        "core-chat.png",
        "core-feed.png",
        "core-group.png",
        "core-self-character.png",
    ]
    titles = [
        "5 幕叙事入场",
        "AI 朋友圈",
        "1v1 聊天",
        "视频号",
        "群聊互动",
        "我的角色",
    ]
    tile_w, tile_h = 360, 780
    title_h = 56
    gap = 24
    margin = 36
    cols, rows = 2, 3
    canvas_w = margin * 2 + cols * tile_w + (cols - 1) * gap
    canvas_h = margin * 2 + rows * (tile_h + title_h) + (rows - 1) * gap + 80
    canvas = Image.new("RGB", (canvas_w, canvas_h), (245, 245, 247))
    draw = ImageDraw.Draw(canvas)
    f_title = font(22, bold=True)
    f_head = font(40, bold=True)
    f_sub = font(20)

    draw.text((margin, margin // 2), "隐界 Enclave · 一个 AI 自己活着的小世界", font=f_head, fill=(20, 20, 20))
    draw.text((margin, margin // 2 + 50), "github.com/yuanzui0728/enclave", font=f_sub, fill=(120, 120, 120))

    y0 = margin + 80
    for idx, (fn, title) in enumerate(zip(files, titles)):
        r, c = divmod(idx, cols)
        x = margin + c * (tile_w + gap)
        y = y0 + r * (tile_h + title_h + gap)
        img = Image.open(SHOTS / fn).convert("RGB").resize((tile_w, tile_h), Image.LANCZOS)
        canvas.paste(img, (x, y))
        draw.rectangle((x, y + tile_h, x + tile_w, y + tile_h + title_h), fill=(255, 255, 255))
        bbox = draw.textbbox((0, 0), title, font=f_title)
        tw = bbox[2] - bbox[0]
        draw.text((x + (tile_w - tw) // 2, y + tile_h + (title_h - (bbox[3] - bbox[1])) // 2), title, font=f_title, fill=(30, 30, 30))

    out = ASSETS / "day7" / "01-grid-2x3.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, optimize=True)
    return out


def grid_3x3_with_todo() -> Path:
    """3x3 grid; 6 real + 3 'TODO' placeholders for the unshot screens."""
    real = [
        ("core-onboarding.png", "5 幕叙事入场"),
        ("core-moments.png", "AI 朋友圈"),
        ("core-chat.png", "1v1 聊天"),
        ("core-feed.png", "视频号"),
        ("core-group.png", "群聊"),
        ("core-self-character.png", "我的角色"),
    ]
    todos = ["角色编辑器\n(后台现截)", "赛博分身三档\n(自部署现截)", "AI 群聊互怼\n(自部署现截)"]
    tile_w, tile_h = 320, 692
    title_h = 56
    gap = 22
    margin = 32
    cols, rows = 3, 3
    canvas_w = margin * 2 + cols * tile_w + (cols - 1) * gap
    canvas_h = margin * 2 + rows * (tile_h + title_h) + (rows - 1) * gap + 80
    canvas = Image.new("RGB", (canvas_w, canvas_h), (245, 245, 247))
    draw = ImageDraw.Draw(canvas)
    f_title = font(20, bold=True)
    f_head = font(40, bold=True)
    f_sub = font(20)
    f_todo = font(22)

    draw.text((margin, margin // 2), "隐界 · 7 天发完了，欢迎来住进这个世界", font=f_head, fill=(20, 20, 20))
    draw.text((margin, margin // 2 + 50), "github.com/yuanzui0728/enclave  ⭐", font=f_sub, fill=(120, 120, 120))

    y0 = margin + 80
    cells = list(real) + [(None, t) for t in todos]
    for idx, (fn, title) in enumerate(cells):
        r, c = divmod(idx, cols)
        x = margin + c * (tile_w + gap)
        y = y0 + r * (tile_h + title_h + gap)
        if fn is None:
            draw.rectangle((x, y, x + tile_w, y + tile_h), fill=(225, 228, 235), outline=(190, 195, 205), width=2)
            lines = title.split("\n")
            total_h = sum((draw.textbbox((0, 0), L, font=f_todo)[3] - draw.textbbox((0, 0), L, font=f_todo)[1]) for L in lines) + (len(lines) - 1) * 8
            cy = y + (tile_h - total_h) // 2
            for L in lines:
                bb = draw.textbbox((0, 0), L, font=f_todo)
                lw = bb[2] - bb[0]
                draw.text((x + (tile_w - lw) // 2, cy), L, font=f_todo, fill=(110, 115, 125))
                cy += (bb[3] - bb[1]) + 8
            draw.rectangle((x, y + tile_h, x + tile_w, y + tile_h + title_h), fill=(255, 255, 255))
            bb = draw.textbbox((0, 0), "TODO 现截", font=f_title)
            tw = bb[2] - bb[0]
            draw.text((x + (tile_w - tw) // 2, y + tile_h + (title_h - (bb[3] - bb[1])) // 2), "TODO 现截", font=f_title, fill=(200, 100, 80))
        else:
            img = Image.open(SHOTS / fn).convert("RGB").resize((tile_w, tile_h), Image.LANCZOS)
            canvas.paste(img, (x, y))
            draw.rectangle((x, y + tile_h, x + tile_w, y + tile_h + title_h), fill=(255, 255, 255))
            bb = draw.textbbox((0, 0), title, font=f_title)
            tw = bb[2] - bb[0]
            draw.text((x + (tile_w - tw) // 2, y + tile_h + (title_h - (bb[3] - bb[1])) // 2), title, font=f_title, fill=(30, 30, 30))

    out = ASSETS / "day7" / "02-grid-3x3-with-todo.png"
    canvas.save(out, optimize=True)
    return out


def architecture_diagram() -> Path:
    """Day 6 stack diagram: clients -> backend -> LLM."""
    W, H = 1200, 900
    canvas = Image.new("RGB", (W, H), (250, 250, 252))
    d = ImageDraw.Draw(canvas)
    f_head = font(44, bold=True)
    f_layer = font(28, bold=True)
    f_box = font(24, bold=True)
    f_note = font(20)

    d.text((40, 24), "隐界 Enclave · 技术架构", font=f_head, fill=(20, 20, 20))
    d.text((40, 80), "8 个月独立开发 · MIT 开源 · Docker 一键部署", font=f_note, fill=(110, 110, 120))

    def layer(y, h, color, name, items, note):
        d.rounded_rectangle((40, y, W - 40, y + h), radius=18, fill=color, outline=(200, 205, 215), width=2)
        d.text((60, y + 16), name, font=f_layer, fill=(30, 30, 40))
        d.text((W - 360, y + 22), note, font=f_note, fill=(110, 110, 120))
        box_w = (W - 80 - 60) // len(items) - 10
        for i, item in enumerate(items):
            bx = 60 + i * (box_w + 18)
            by = y + 70
            d.rounded_rectangle((bx, by, bx + box_w, by + h - 90), radius=12, fill=(255, 255, 255), outline=(180, 185, 200), width=2)
            lines = item.split("\n")
            total_h = sum((d.textbbox((0, 0), L, font=f_box)[3] - d.textbbox((0, 0), L, font=f_box)[1]) for L in lines) + (len(lines) - 1) * 6
            cy = by + ((h - 90) - total_h) // 2
            for L in lines:
                bb = d.textbbox((0, 0), L, font=f_box)
                lw = bb[2] - bb[0]
                d.text((bx + (box_w - lw) // 2, cy), L, font=f_box, fill=(30, 30, 40))
                cy += (bb[3] - bb[1]) + 6

    layer(130, 200, (232, 240, 254), "客户端层",
          ["Web\nReact + Vite", "iOS / Android\nCapacitor", "Desktop\nTauri", "Admin\n@yinjie/ui"],
          "前端 5180 / 后台 5181")

    # arrows
    for x in (260, 540, 820, 1100 - 60):
        d.line((x, 340, x, 370), fill=(150, 155, 170), width=3)
        d.polygon([(x - 8, 365), (x + 8, 365), (x, 380)], fill=(150, 155, 170))

    layer(390, 220, (236, 248, 240), "后端层 · NestJS",
          ["REST + WS\nSocket.IO", "TypeORM\n+ SQLite", "Scheduler\nCron 驱动", "21 实体\n社交关系网"],
          "端口 3000 · 数据全在本地")

    for x in (260, 540, 820, 1100 - 60):
        d.line((x, 620, x, 660), fill=(150, 155, 170), width=3)
        d.polygon([(x - 8, 655), (x + 8, 655), (x, 670)], fill=(150, 155, 170))

    layer(680, 180, (254, 244, 232), "LLM 层 · OpenAI 兼容",
          ["DeepSeek\n约 ¥30/月", "OpenAI\nGPT-4 系列", "Ollama\n完全离线", "自定义\nany OpenAI API"],
          "可热切换 / 多模型并存")

    out = ASSETS / "day6" / "01-architecture.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, optimize=True)
    return out


def placeholder(title: str, hint: str, out_rel: str) -> Path:
    """Generate a soft placeholder card for screenshots the user still needs to take."""
    W, H = 1080, 1440
    canvas = Image.new("RGB", (W, H), (245, 247, 250))
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle((60, 60, W - 60, H - 60), radius=32, fill=(255, 255, 255), outline=(210, 215, 225), width=3)
    f_tag = font(28, bold=True)
    f_title = font(56, bold=True)
    f_hint = font(28)

    d.rounded_rectangle((110, 110, 360, 170), radius=14, fill=(255, 235, 220))
    d.text((130, 122), "TODO · 待截图", font=f_tag, fill=(200, 100, 60))

    # title
    d.text((110, 240), title, font=f_title, fill=(25, 25, 30))

    # multi-line hint
    y = 360
    for line in hint.split("\n"):
        d.text((110, y), line, font=f_hint, fill=(90, 95, 110))
        y += 46

    out = ASSETS / out_rel
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, optimize=True)
    return out


def terminal_card() -> Path:
    """Day 6 second image: mock terminal showing docker compose up."""
    W, H = 1200, 700
    canvas = Image.new("RGB", (W, H), (245, 247, 250))
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle((40, 40, W - 40, H - 40), radius=20, fill=(28, 30, 38))
    # window dots
    for i, color in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse((70 + i * 28, 70, 90 + i * 28, 90), fill=color)
    # use a CJK-capable font so Chinese + [OK]render correctly; sacrifice mono spacing
    text_font = font(26)
    label_font = font(22)

    lines = [
        ("$ git clone https://github.com/yuanzui0728/enclave.git", (180, 220, 180), text_font),
        ("$ cd enclave && cp api/.env.example api/.env", (200, 200, 210), text_font),
        ("$ docker compose up -d", (180, 220, 180), text_font),
        ("", (200, 200, 200), text_font),
        ("[+] Running 3/3", (200, 200, 210), text_font),
        (" [OK] Network  enclave_default     Created", (130, 200, 130), text_font),
        (" [OK] Container enclave-api        Started", (130, 200, 130), text_font),
        (" [OK] Container enclave-web        Started", (130, 200, 130), text_font),
        ("", (200, 200, 200), text_font),
        ("→ http://localhost:5180    主 App", (180, 210, 240), text_font),
        ("→ http://localhost:5181    管理后台", (180, 210, 240), text_font),
        ("→ http://localhost:3000    NestJS API", (180, 210, 240), text_font),
        ("", (200, 200, 200), text_font),
        ("# 三行命令，你自己的 AI 社交世界就跑起来了", (140, 145, 160), label_font),
    ]
    y = 130
    for text, color, fnt in lines:
        d.text((90, y), text, font=fnt, fill=color)
        y += 36

    out = ASSETS / "day6" / "02-docker-compose.png"
    canvas.save(out, optimize=True)
    return out


def main():
    print("→ Compress GIF")
    p = compress_gif()
    print(f"  out: {p}  {p.stat().st_size/1024:.0f} KB")

    print("→ Day 7 grid 2x3")
    p = grid_2x3()
    print(f"  out: {p}  {p.stat().st_size/1024:.0f} KB")

    print("→ Day 7 grid 3x3 with TODO slots")
    p = grid_3x3_with_todo()
    print(f"  out: {p}  {p.stat().st_size/1024:.0f} KB")

    print("→ Day 6 architecture diagram")
    p = architecture_diagram()
    print(f"  out: {p}  {p.stat().st_size/1024:.0f} KB")

    print("→ Day 6 docker compose card")
    p = terminal_card()
    print(f"  out: {p}  {p.stat().st_size/1024:.0f} KB")

    # placeholder cards for the screenshots you still need to capture
    todos = [
        ("day3/01-character-editor.png",
         "Day 3 主图 · 后台角色编辑器",
         "页面：apps/admin → 角色编辑器 (character-editor-page.tsx)\n建议同框露出：人设 / 作息 / 关系网 三栏\n截图后请覆盖此文件"),
        ("day4/01-self-agent-modes.png",
         "Day 4 主图 · 赛博分身三档模式",
         "页面：apps/app → 赛博分身入口 (self-agent-page.tsx)\n建议截：陪伴 / 复盘 / 整理 三档选择界面\n截图后请覆盖此文件"),
        ("day4/02-self-agent-review.png",
         "Day 4 副图 · 复盘对话实例",
         "页面：和赛博分身的一次真实复盘对话\n要求：脱敏，重点是 AI 在「观察你」而不是「安慰你」\n截图后请覆盖此文件"),
        ("day5/01-group-chat.png",
         "Day 5 主图 · AI 5 人群聊互怼",
         "页面：apps/app → 群聊页面 (group-chat-page.tsx)\n建议：拉一个 5 人 AI 群跑一遍，截连续 9 屏拼图\n截图后请覆盖此文件"),
    ]
    print("→ Placeholders for TODO screenshots")
    for rel, title, hint in todos:
        p = placeholder(title, hint, rel)
        print(f"  out: {p}")


if __name__ == "__main__":
    main()
