"""
build.py — Gera o site estático para deploy no GitHub Pages.
Lê os arquivos Excel, produz JSON e monta a pasta dist/.
"""
import pandas as pd
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "backend" / "data"
FRONTEND_DIR = ROOT / "frontend"
DIST_DIR = ROOT / "dist"


def classificar_faixa(pct):
    if pd.isna(pct):
        return "Sem dados"
    if pct <= 40:
        return "Crítico"
    elif pct <= 60:
        return "Atenção"
    elif pct <= 80:
        return "Intermediário"
    else:
        return "Adequado"


def build():
    # Limpa dist/
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    DIST_DIR.mkdir()
    (DIST_DIR / "data").mkdir()

    # ── Habilidades ──
    path_hab = DATA_DIR / "DADOS_ACERTO_POR_HABILIDADE.xlsx"
    df = pd.read_excel(path_hab)
    df.columns = [
        "avaliacao", "rede", "ano_escolar", "componente",
        "escola", "habilidade_codigo", "habilidade_descricao",
        "acerto_pct", "nivel_dificuldade"
    ]
    df["ano_escolar"] = df["ano_escolar"].astype(str).str.extract(r"(\d+º\s*(?:Ano|ANO))", expand=False)
    df["componente"] = df["componente"].str.strip()
    df["componente"] = df["componente"].map(
        {"LP": "Língua Portuguesa", "MT": "Matemática"}
    ).fillna(df["componente"])
    df = df.dropna(subset=["ano_escolar", "escola", "habilidade_codigo"])
    df["acerto_pct"] = pd.to_numeric(df["acerto_pct"], errors="coerce")
    df["habilidade_pos"] = (
        df["habilidade_codigo"]
        .str.extract(r"(H\s?\d+)", expand=False)
        .str.replace(" ", "", regex=False)
    )
    df["habilidade_descritor"] = (
        df["habilidade_codigo"]
        .str.extract(r"\(([^)]+)\)", expand=False)
        .fillna(df["habilidade_codigo"])
    )
    df["faixa"] = df["acerto_pct"].apply(classificar_faixa)

    hab_cols = [
        "escola", "ano_escolar", "componente", "habilidade_codigo",
        "habilidade_descricao", "acerto_pct", "nivel_dificuldade",
        "habilidade_pos", "habilidade_descritor", "faixa"
    ]
    hab_str = df[hab_cols].to_json(orient="records", force_ascii=False)
    (DIST_DIR / "data" / "habilidades.json").write_text(hab_str, encoding="utf-8")

    # ── Desempenho ──
    path_des = DATA_DIR / "desempenho_por_ano.xlsx"
    df2 = pd.read_excel(path_des, header=None, skiprows=2)
    df2.columns = ["escola", "ano_escolar", "lp_pct", "mt_pct", "media_geral"]
    df2["lp_pct"] = pd.to_numeric(df2["lp_pct"], errors="coerce")
    df2["mt_pct"] = pd.to_numeric(df2["mt_pct"], errors="coerce")
    df2["media_geral"] = pd.to_numeric(df2["media_geral"], errors="coerce")
    df2["ano_escolar"] = df2["ano_escolar"].astype(str).str.strip()
    df2["escola"] = df2["escola"].astype(str).str.strip()

    des_str = df2.to_json(orient="records", force_ascii=False)
    (DIST_DIR / "data" / "desempenho.json").write_text(des_str, encoding="utf-8")

    # ── Análise por Escola ──
    path_analise = DATA_DIR / "desempenho_por_ano_analise.xlsx"
    df3 = pd.read_excel(path_analise, sheet_name=0, header=1)
    df3.columns = [
        "escola", "ano_escolar", "lp_pct", "mt_pct", "media_geral",
        "gap_lp_mat", "vs_rede", "media_escola", "classificacao", "hab_criticas"
    ]
    df3["escola"] = df3["escola"].astype(str).str.strip()
    rede_mask = df3["escola"].str.startswith("Média")
    rede_row = df3[rede_mask].iloc[0] if rede_mask.any() else None
    df3 = df3[~rede_mask].copy()
    for col in ["lp_pct", "mt_pct", "media_geral", "gap_lp_mat", "vs_rede", "media_escola", "hab_criticas"]:
        df3[col] = pd.to_numeric(df3[col], errors="coerce")
    for col in ["lp_pct", "mt_pct", "media_geral", "gap_lp_mat", "vs_rede", "media_escola"]:
        df3[col] = df3[col].round(1)
    df3["hab_criticas"] = df3["hab_criticas"].round(0)
    df3["classificacao"] = df3["classificacao"].astype(str).str.strip()
    df3["ano_escolar"] = df3["ano_escolar"].astype(str).str.strip()
    df3 = df3.dropna(subset=["escola", "media_geral"])

    rede_analise = {}
    if rede_row is not None:
        rede_analise = {
            "lp": round(float(pd.to_numeric(rede_row["lp_pct"], errors="coerce")), 2),
            "mt": round(float(pd.to_numeric(rede_row["mt_pct"], errors="coerce")), 2),
            "media": round(float(pd.to_numeric(rede_row["media_geral"], errors="coerce")), 2),
        }

    escola_agg = df3.groupby("escola").agg(
        media=("media_escola", "first"),
        lp=("lp_pct", "mean"),
        mt=("mt_pct", "mean"),
        gap=("gap_lp_mat", "mean"),
        hab_criticas=("hab_criticas", "sum"),
    ).round(1).reset_index()
    escola_cls = (
        df3.groupby("escola")["classificacao"]
        .agg(lambda x: x.mode().iloc[0] if not x.empty else "Regular")
        .reset_index()
    )
    escola_cls.columns = ["escola", "classificacao"]
    escola_agg = escola_agg.merge(escola_cls, on="escola")
    escola_agg["hab_criticas"] = escola_agg["hab_criticas"].astype(int)
    escola_agg = escola_agg.sort_values("media", ascending=False)

    import math

    def nan_safe(obj):
        if isinstance(obj, float) and math.isnan(obj):
            return None
        if isinstance(obj, dict):
            return {k: nan_safe(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [nan_safe(i) for i in obj]
        return obj

    detalhe_cols = [
        "escola", "ano_escolar", "lp_pct", "mt_pct", "media_geral",
        "gap_lp_mat", "vs_rede", "media_escola", "classificacao", "hab_criticas"
    ]
    detalhe_records = nan_safe(df3[detalhe_cols].to_dict(orient="records"))
    escola_records = nan_safe(escola_agg.to_dict(orient="records"))

    analise_out = {
        "detalhe": detalhe_records,
        "escolas": escola_records,
        "rede": rede_analise,
    }
    analise_str = json.dumps(analise_out, ensure_ascii=False)
    (DIST_DIR / "data" / "analise.json").write_text(analise_str, encoding="utf-8")

    # ── Copia frontend ──
    for fname in ["index.html", "style.css", "script.js"]:
        shutil.copy2(FRONTEND_DIR / fname, DIST_DIR / fname)

    (DIST_DIR / ".nojekyll").write_text("", encoding="utf-8")

    hab_count = len(json.loads(hab_str))
    des_count = len(json.loads(des_str))
    analise_count = len(escola_records)
    print(f"Build OK - {hab_count} habilidades, {des_count} desempenho, {analise_count} escolas (analise) -> dist/")


if __name__ == "__main__":
    build()
