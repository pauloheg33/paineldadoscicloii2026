"""
build.py — Gera o site estático para deploy no GitHub Pages.
Lê os arquivos Excel, produz JSON e monta a pasta dist/.
"""
import pandas as pd
import json
import shutil
import unicodedata
from pathlib import Path

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "backend" / "data"
FRONTEND_DIR = ROOT / "frontend"
DIST_DIR = ROOT / "dist"
VALID_COMPONENTES = {"Língua Portuguesa", "Matemática"}


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


def extrair_ano_ordenavel(valor):
    match = pd.Series([str(valor)]).str.extract(r"(\d+)")[0].iloc[0]
    return int(match) if pd.notna(match) else 999


def normalizar_ano_label(valor):
    texto = str(valor).strip()
    match = pd.Series([texto]).str.extract(r"(?i)(\d+)\s*º?\s*ano\b")[0].iloc[0]
    if pd.notna(match):
        return f"{int(match)}º Ano"
    fallback = pd.Series([texto]).str.extract(r"(\d+)")[0].iloc[0]
    return f"{int(fallback)}º Ano" if pd.notna(fallback) else None


def chave_escola(valor):
    texto = " ".join(str(valor).strip().upper().split())
    return "".join(
        c for c in unicodedata.normalize("NFKD", texto)
        if not unicodedata.combining(c)
    )


def normalizar_nome_escola(valor, mapa_escolas):
    texto = str(valor).strip()
    if not texto or texto.lower() == "nan":
        return None
    return mapa_escolas.get(chave_escola(texto), texto)


def construir_mapa_escolas():
    mapa = {}
    for path, kwargs in [
        (DATA_DIR / "desempenho_por_ano.xlsx", {"header": None, "skiprows": 2}),
        (DATA_DIR / "desempenho_por_ano_analise.xlsx", {"sheet_name": 0, "header": 1}),
        (DATA_DIR / "desempenho_por_turma.xlsx", {"sheet_name": "modelo_turmas"}),
    ]:
        if not path.exists():
            continue
        try:
            df = pd.read_excel(path, **kwargs)
        except ValueError:
            df = pd.read_excel(path)
        escola_col = "escola" if "escola" in df.columns else df.columns[0]
        for raw in df[escola_col].tolist():
            texto = str(raw).strip()
            if not texto or texto.lower() == "nan":
                continue
            mapa[chave_escola(texto)] = texto
    return mapa


def classificar_status(pct):
    if pd.isna(pct):
        return "Sem dados"
    if pct <= 40:
        return "Crítico"
    elif pct <= 60:
        return "Atenção"
    elif pct <= 80:
        return "Regular"
    return "Adequado"


def build():
    mapa_escolas = construir_mapa_escolas()

    # Limpa dist/
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    (DIST_DIR / "data").mkdir(parents=True, exist_ok=True)

    # ── Habilidades ──
    path_hab = DATA_DIR / "DADOS_ACERTO_POR_HABILIDADE.xlsx"
    df = pd.read_excel(path_hab)
    df.columns = [
        "avaliacao", "rede", "ano_escolar", "componente",
        "escola", "habilidade_codigo", "habilidade_descricao",
        "acerto_pct", "nivel_dificuldade"
    ]
    df["ano_escolar"] = df["ano_escolar"].apply(normalizar_ano_label)
    df["componente"] = df["componente"].str.strip()
    df["componente"] = df["componente"].map(
        {"LP": "Língua Portuguesa", "MT": "Matemática"}
    ).fillna(df["componente"])
    df["escola"] = df["escola"].apply(lambda v: normalizar_nome_escola(v, mapa_escolas))
    df = df[df["componente"].isin(VALID_COMPONENTES)].copy()
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
    df2["ano_escolar"] = df2["ano_escolar"].apply(normalizar_ano_label)
    df2["escola"] = df2["escola"].apply(lambda v: normalizar_nome_escola(v, mapa_escolas))
    df2 = df2.dropna(subset=["ano_escolar", "escola"])
    df2["ano_sort"] = df2["ano_escolar"].apply(extrair_ano_ordenavel)
    df2 = df2.sort_values(["escola", "ano_sort"]).drop(columns=["ano_sort"])

    des_str = df2.to_json(orient="records", force_ascii=False)
    (DIST_DIR / "data" / "desempenho.json").write_text(des_str, encoding="utf-8")

    # ── Análise por Escola ──
    path_analise = DATA_DIR / "desempenho_por_ano_analise.xlsx"
    df3 = pd.read_excel(path_analise, sheet_name=0, header=1)
    df3.columns = [
        "escola", "ano_escolar", "lp_pct", "mt_pct", "media_geral",
        "gap_lp_mat", "vs_rede", "media_escola", "classificacao", "hab_criticas"
    ]
    df3["escola"] = df3["escola"].apply(lambda v: normalizar_nome_escola(v, mapa_escolas))
    rede_mask = df3["escola"].str.startswith("Média")
    rede_row = df3[rede_mask].iloc[0] if rede_mask.any() else None
    df3 = df3[~rede_mask].copy()
    for col in ["lp_pct", "mt_pct", "media_geral", "gap_lp_mat", "vs_rede", "media_escola", "hab_criticas"]:
        df3[col] = pd.to_numeric(df3[col], errors="coerce")
    for col in ["lp_pct", "mt_pct", "media_geral", "gap_lp_mat", "vs_rede", "media_escola"]:
        df3[col] = df3[col].round(1)
    df3["hab_criticas"] = df3["hab_criticas"].round(0)
    df3["classificacao"] = df3["classificacao"].astype(str).str.strip()
    df3["ano_escolar"] = df3["ano_escolar"].apply(normalizar_ano_label)
    df3 = df3.dropna(subset=["escola", "media_geral"])
    df3["ano_sort"] = df3["ano_escolar"].apply(extrair_ano_ordenavel)
    df3 = df3.sort_values(["escola", "ano_sort"]).drop(columns=["ano_sort"])

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

    # ── Turmas ──
    path_turmas = DATA_DIR / "desempenho_por_turma.xlsx"
    turmas_records = []
    if path_turmas.exists():
        try:
            df4 = pd.read_excel(path_turmas, sheet_name="modelo_turmas")
        except ValueError:
            df4 = pd.read_excel(path_turmas)
        df4.columns = [str(c).strip().lower() for c in df4.columns]
        expected_cols = [
            "escola", "turma", "ano_escolar", "componente",
            "media_pct", "alunos_avaliados", "hab_criticas", "classificacao"
        ]
        missing = [c for c in expected_cols if c not in df4.columns]
        if missing:
            raise ValueError(
                "A planilha desempenho_por_turma.xlsx está sem as colunas obrigatórias: "
                + ", ".join(missing)
            )

        df4["escola"] = df4["escola"].apply(lambda v: normalizar_nome_escola(v, mapa_escolas))
        df4["turma"] = df4["turma"].astype(str).str.strip()
        df4["ano_escolar"] = df4["ano_escolar"].apply(normalizar_ano_label)
        df4["componente"] = df4["componente"].astype(str).str.strip()
        df4["componente"] = df4["componente"].map(
            {"LP": "Língua Portuguesa", "MT": "Matemática"}
        ).fillna(df4["componente"])
        df4 = df4[df4["componente"].isin(VALID_COMPONENTES)].copy()
        df4["media_pct"] = pd.to_numeric(df4["media_pct"], errors="coerce")
        df4["alunos_avaliados"] = pd.to_numeric(df4["alunos_avaliados"], errors="coerce").fillna(0).astype(int)
        df4["hab_criticas"] = pd.to_numeric(df4["hab_criticas"], errors="coerce").fillna(0).astype(int)
        df4["classificacao"] = (
            df4["classificacao"]
            .astype(str)
            .str.strip()
            .replace({"": None, "nan": None, "None": None})
        )
        df4["classificacao"] = df4["classificacao"].where(
            df4["classificacao"].notna(),
            df4["media_pct"].apply(classificar_status)
        )
        df4["faixa"] = df4["media_pct"].apply(classificar_faixa)
        df4 = df4.dropna(subset=["escola", "turma", "ano_escolar", "componente", "media_pct"])
        df4["ano_sort"] = df4["ano_escolar"].apply(extrair_ano_ordenavel)
        df4 = df4.sort_values(["escola", "ano_sort", "turma", "componente"]).drop(columns=["ano_sort"])

        turmas_cols = [
            "escola", "turma", "ano_escolar", "componente",
            "media_pct", "alunos_avaliados", "hab_criticas", "classificacao", "faixa"
        ]
        turmas_records = df4[turmas_cols].to_dict(orient="records")

    turmas_str = json.dumps(turmas_records, ensure_ascii=False)
    (DIST_DIR / "data" / "turmas.json").write_text(turmas_str, encoding="utf-8")

    # ── Copia frontend ──
    for fname in ["index.html", "style.css", "script.js"]:
        shutil.copy2(FRONTEND_DIR / fname, DIST_DIR / fname)

    (DIST_DIR / ".nojekyll").write_text("", encoding="utf-8")

    hab_count = len(json.loads(hab_str))
    des_count = len(json.loads(des_str))
    analise_count = len(escola_records)
    turmas_count = len(turmas_records)
    print(
        f"Build OK - {hab_count} habilidades, {des_count} desempenho, "
        f"{analise_count} escolas (analise), {turmas_count} registros de turmas -> dist/"
    )


if __name__ == "__main__":
    build()
