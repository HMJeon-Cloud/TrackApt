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

def _cells(tr):
    out = []
    for m in re.finditer(r"<t([dh])([^>]*)>(.*?)</t[dh]>", tr, flags=re.S | re.I):
        txt = html.unescape(re.sub(r"<[^>]+>", "", m.group(3))).replace("\xa0", " ")
        txt = re.sub(r"\s+", " ", txt).strip()
        cs = re.search(r"colspan=\"?(\d+)", m.group(2), flags=re.I)
        out.append((txt, int(cs.group(1)) if cs else 1))
    return out

def parse_schoolinfo(txt):
    """학교알리미 '교과별(학년별) 학업성취 사항' 학교별 다운로드(HTML 로 된 .xls) 전용.
       구조: [학년도] / [과 목 | N학년] / [1학기 | 2학기] / [평균 | 성취도별분포비율]×2 / [A..E]×2 / 과목 행(13칸) … 를 학년마다 반복.
       학교 이름은 표 밖 '학교 : ○○중학교' 줄에 있다.
       → 정규화 행: 학교명, 학년도, 학년, 학기, 과목, 평균, A, B, C, D, E"""
    body = re.sub(r"<style.*?</style>|<script.*?</script>", "", txt, flags=re.S | re.I)
    m = re.search(r"학교\s*[:：]\s*([가-힣A-Za-z0-9·()\s]+?(?:중학교|고등학교|학교))", html.unescape(re.sub(r"<[^>]+>", " ", body)))
    school = re.sub(r"\s+", "", m.group(1)) if m else ""
    rows = [_cells(tr) for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", body, flags=re.S | re.I)]
    out, year, grade, sems = [], "", "", []
    for r in rows:
        texts = [c[0] for c in r]
        if not texts:
            continue
        y = re.match(r"^(20\d\d)\s*학년도", texts[0])
        if y and len(texts) == 1:
            year = y.group(1); continue
        if any(re.match(r"^\d학년$", t) for t in texts):
            grade = next(t for t in texts if re.match(r"^\d학년$", t))[0]; sems = []; continue
        if all(re.match(r"^\d학기$", t) for t in texts if t):
            sems = [t[0] for t in texts if t]; continue
        if texts[0] in ("평균", "A") or "결과가 없습니다" in texts[0]:
            continue
        # 과목 행: 과목 + (평균 A B C D E) × 학기 수
        if len(texts) >= 7 and grade and not re.match(r"^[\d.]+$", texts[0]):
            subj = texts[0]
            vals = texts[1:]
            nsem = max(1, len(sems) or (len(vals) // 6))
            for k in range(nsem):
                chunk = vals[k * 6:(k + 1) * 6]
                if len(chunk) < 6 or not re.match(r"^[\d.]+$", chunk[0] or ""):
                    continue
                out.append([school, year, grade, (sems[k] if k < len(sems) else str(k + 1)), subj] + chunk)
    return school, year, out

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
                txt = None
                for enc in ("utf-8", "cp949"):
                    try:
                        txt = raw.decode(enc); break
                    except Exception:
                        pass
                school, year, norm = parse_schoolinfo(txt or "") if txt else ("", "", [])
                if norm:
                    rows = [["학교명", "학년도", "학년", "학기", "과목", "평균", "A", "B", "C", "D", "E"]] + norm
                    how = "학교알리미 성취표(" + (school or "학교명 없음") + " · " + (year or "?") + "학년도)"
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
