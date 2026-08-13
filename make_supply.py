# -*- coding: utf-8 -*-
"""
supply_data.json 생성기 (TrackApt v3.5)
입력 (모두 cp949 CSV):
  1) 미분양주택현황보고_시_군_구별_미분양현황_*.csv   (통계누리)   → unsold
  2) 주택건설실적통계_준공_*.csv                     (통계누리)   → completions
  3) *_주민등록인구및세대현황_월간.csv               (행안부)     → population
  4) 부동산원 보도자료(PDF) 수치는 EXPECTED 상수로 하드코딩       → expected
"""
import glob, json, csv, io, os, re

SRC = "/mnt/user-data/uploads"
OUT = "/home/claude/trackapt/supply_data.json"

SIDO_SHORT = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천",
    "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종",
    "경기도": "경기", "강원도": "강원", "강원특별자치도": "강원", "충청북도": "충북",
    "충청남도": "충남", "전라북도": "전북", "전북특별자치도": "전북", "전라남도": "전남",
    "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주", "제주도": "제주",
}

def rd(path):
    return open(path, "rb").read().decode("cp949")

def ymn(s):           # "2010-01" -> 절대 개월수
    y, m = s.split("-")
    return int(y) * 12 + int(m)

def num(s):
    s = s.strip().strip('"').replace(",", "")
    if s in ("", "-", "N/A"): return None
    try: return int(float(s))
    except ValueError: return None

# ── 1. 미분양 ───────────────────────────────────────────────
def build_unsold():
    raw = {}                       # key -> {ym: value}
    months = set()
    for f in sorted(glob.glob(os.path.join(SRC, "미분양주택현황보고*.csv"))):
        for line in rd(f).splitlines()[1:]:
            if not line.strip(): continue
            p = line.split(",")
            if len(p) < 4: continue
            ym, sido, sgg = p[0].strip(), p[1].strip(), p[2].strip()
            v = num(",".join(p[3:]))          # 천단위 쉼표가 따옴표 없이 들어있음
            if v is None: continue
            months.add(ym)
            key = sido if sgg == "계" else sido + " " + sgg
            raw.setdefault(key, {})[ym] = v
    # 전국 = 시도 '계'의 합
    sidos = [k for k in raw if " " not in k]
    nation = {}
    for s in sidos:
        for ym, v in raw[s].items():
            nation[ym] = nation.get(ym, 0) + v
    raw["전국"] = nation

    ms = sorted(months)
    t0, t1 = ymn(ms[0]), ymn(ms[-1])
    n = t1 - t0 + 1
    series = {}
    for key, d in raw.items():
        arr = [d.get(f"{(t-1)//12}-{((t-1)%12)+1:02d}") for t in range(t0, t1 + 1)]
        o = 0
        while o < len(arr) and arr[o] is None: o += 1
        if o >= len(arr): continue
        series[key] = {"o": o, "v": arr[o:]}
    return {"dates": [ms[0], ms[-1], n], "series": series}, ms[-1]

# ── 2. 준공 실적 (연간, 시도별) ─────────────────────────────
def build_completions():
    by = {}                        # sido -> {year: sum}
    mon = {}                       # sido -> {year: set(month)}
    for f in sorted(glob.glob(os.path.join(SRC, "주택건설실적통계_준공*.csv"))):
        for line in rd(f).splitlines()[1:]:
            if not line.strip(): continue
            p = line.split(",")
            if len(p) < 5: continue
            ym, gubun, bumun, sido = p[0].strip(), p[1].strip(), p[2].strip(), p[3].strip()
            if gubun != "총계" or bumun != "총계": continue
            v = num(",".join(p[4:]))
            if v is None: continue
            y = int(ym.split("-")[0])
            by.setdefault(sido, {})[y] = by.setdefault(sido, {}).get(y, 0) + v
            mon.setdefault(sido, {}).setdefault(y, set()).add(ym)
    # 12개월이 다 있는 해만 채택 (2010 상반기·2026 상반기 제외)
    full = sorted({y for y in mon.get("전국", {}) if len(mon["전국"][y]) == 12})
    sido = {}
    for s, d in by.items():
        sido[s] = [d.get(y) for y in full]
    return {"years": full, "sido": sido}

# ── 3. 인구 (최신월) ────────────────────────────────────────
def build_population():
    files = sorted(glob.glob(os.path.join(SRC, "*주민등록인구및세대현황_월간.csv")))
    f = files[-1]
    rows = list(csv.reader(io.StringIO(rd(f))))
    hdr = rows[0]
    pops = [i for i, h in enumerate(hdr) if h.endswith("_총인구수")]
    i = pops[-1]
    ym = hdr[i].split("_")[0]                        # "2026년06월"
    sido, sgg = {}, {}
    total = 0
    for r in rows[1:]:
        name = re.sub(r"\s*\(\d+\)\s*$", "", r[0]).strip()
        v = num(r[i])
        if v is None or v == 0: continue
        parts = name.split()
        if len(parts) == 1:                          # 시·도
            s = SIDO_SHORT.get(parts[0])
            if not s: continue
            sido[s] = v
            total += v
        else:
            s = SIDO_SHORT.get(parts[0])
            if not s: continue
            rest = " ".join(parts[1:])
            if "출장소" in rest: continue
            sgg[s + " " + rest] = v
    return {"total": total, "sido": sido, "sigungu": sgg}, ym

# ── 4. 입주예정 (부동산원·R114 2026.2.27 보도자료) ──────────
EXPECTED_2026 = {
    "서울": 27158, "경기": 62893, "인천": 15161, "부산": 11489, "대구": 10752,
    "광주": 11490, "대전": 6179, "울산": 4478, "세종": 42, "강원": 7875,
    "충북": 7314, "충남": 10474, "전북": 6349, "전남": 4381, "경북": 4739,
    "경남": 7245, "제주": 564,
}
EXPECTED_2027 = {
    "서울": 17197, "경기": 83169, "인천": 15376, "부산": 17750, "대구": 1686,
    "광주": 8427, "대전": 17441, "울산": 5177, "세종": 0, "강원": 4543,
    "충북": 12466, "충남": 11689, "전북": 2370, "전남": 6266, "경북": 8095,
    "경남": 2473, "제주": 2198,
}
def build_expected():
    items = []
    for y, tbl in ((2026, EXPECTED_2026), (2027, EXPECTED_2027)):
        for s, n in tbl.items():
            if not n: continue
            items.append({"sido": s, "sigungu": "", "ym": y * 100 + 12, "households": n})
    return {"items": items}

# ── 조립 ────────────────────────────────────────────────────
unsold, last_ym = build_unsold()
comp = build_completions()
pop, pop_ym = build_population()
exp = build_expected()

out = {
    "updated": last_ym,
    "note": ("미분양·준공실적=통계누리 / 입주예정=한국부동산원·부동산R114 2026.2.27 보도자료(시·도 연간) / "
             "인구=행안부 주민등록 " + pop_ym + ". kb_data.json처럼 교체하면 자동 반영. "
             "준공후 미분양(unsoldDone)은 원자료 미포함."),
    "unsold": unsold,
    "completions": comp,
    "expected": exp,
    "population": pop,
}
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

print("unsold  :", unsold["dates"], "series", len(unsold["series"]))
print("comp    :", comp["years"][0], "~", comp["years"][-1], "sido", len(comp["sido"]))
print("pop     :", pop_ym, "total", f'{pop["total"]:,}', "sido", len(pop["sido"]), "sgg", len(pop["sigungu"]))
print("expected:", len(exp["items"]), "items")
print("size    :", f'{os.path.getsize(OUT):,} bytes')
