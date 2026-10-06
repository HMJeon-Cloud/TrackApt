#!/usr/bin/env python3
"""data/school 의 옛 엑셀(.xls) 을 CSV 로 바꾼다 (v9.3) — 학교알리미 '다운로드' 는 학교별 .xls 로 떨어진다.
   · 진짜 BIFF .xls → xlrd 로 읽는다 (pip install xlrd)
   · 확장자만 .xls 인 HTML 표(공공 사이트에 흔함) → <table> 을 직접 파싱
   · .xlsx 는 node 쪽에서 바로 읽으므로 건너뜀
   결과: data/school/_converted/<원본이름>.csv (UTF-8). node scripts/school_build.js 가 이 폴더도 읽는다.
   원본 파일 이름을 그대로 붙여 두므로 이름의 '성취/진로' 로 종류를 안다."""
import os, re, sys, csv, html, io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "data", "school")
OUT = os.path.join(DIR, "_converted")

def read_html_table(raw):
    for enc in ("utf-8", "cp949", "euc-kr", "utf-16"):
        try:
            txt = raw.decode(enc); break
        except Exception:
            txt = None
    if txt is None:
        txt = raw.decode("utf-8", "replace")
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", txt, flags=re.S | re.I):
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, flags=re.S | re.I)
        row = [html.unescape(re.sub(r"<[^>]+>", "", c)).replace("\xa0", " ").strip() for c in cells]
        if any(row):
            rows.append(row)
    return rows

def read_biff(path):
    import xlrd
    wb = xlrd.open_workbook(path, formatting_info=False)
    out = []
    for sh in wb.sheets():
        for r in range(sh.nrows):
            row = []
            for c in range(sh.ncols):
                v = sh.cell_value(r, c)
                if isinstance(v, float) and v.is_integer():
                    v = int(v)
                row.append(str(v).strip() if v is not None else "")
            if any(row):
                out.append(row)
        if out:
            break
    return out

def main():
    if not os.path.isdir(DIR):
        print("data/school 없음"); return 0
    files = [f for f in os.listdir(DIR) if f.lower().endswith(".xls")]
    if not files:
        print("변환할 .xls 없음"); return 0
    os.makedirs(OUT, exist_ok=True)
    ok = 0
    for f in sorted(files):
        p = os.path.join(DIR, f)
        with open(p, "rb") as fh:
            raw = fh.read()
        try:
            if raw[:8] == b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1":
                rows = read_biff(p); how = "BIFF"
            elif raw[:4] == b"PK\x03\x04":
                print(f"  {f}: 사실은 xlsx — 이름을 .xlsx 로 바꾸면 node 가 바로 읽습니다"); continue
            else:
                rows = read_html_table(raw); how = "HTML표"
                if not rows:
                    # 탭 구분 텍스트일 수도
                    txt = raw.decode("cp949", "replace")
                    rows = [l.split("\t") for l in txt.splitlines() if l.strip()]; how = "탭텍스트"
        except Exception as e:
            print(f"  {f}: 읽기 실패 — {e}"); continue
        if not rows:
            print(f"  {f}: 표를 못 찾음"); continue
        outp = os.path.join(OUT, re.sub(r"\.xls$", "", f, flags=re.I) + ".csv")
        with open(outp, "w", encoding="utf-8", newline="") as fh:
            csv.writer(fh).writerows(rows)
        ok += 1
        print(f"  {f}: {how} {len(rows)}행 → _converted/{os.path.basename(outp)}")
    print(f"xls → csv {ok}/{len(files)}개")
    return 0

if __name__ == "__main__":
    sys.exit(main())
