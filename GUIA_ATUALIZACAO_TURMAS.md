# Guia de atualização de turmas

## Arquivo usado pelo projeto

O projeto agora lê os dados de turmas a partir de:

- [backend/data/desempenho_por_turma.xlsx](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/backend/data/desempenho_por_turma.xlsx)

## Aba que o build lê

O `build.py` lê a aba:

- `modelo_turmas`

Você pode manter a aba `instrucoes` no arquivo, mas os dados válidos precisam estar em `modelo_turmas`.

## Colunas obrigatórias

Na aba `modelo_turmas`, as colunas obrigatórias são:

1. `escola`
2. `turma`
3. `ano_escolar`
4. `componente`
5. `media_pct`
6. `alunos_avaliados`
7. `hab_criticas`
8. `classificacao`

## Como preencher

### `escola`

Nome da escola como deve aparecer no painel.

### `turma`

Identificador da turma.

Exemplos:

- `2º A`
- `5º B`
- `Turma Única`

### `ano_escolar`

Formato recomendado:

- `2º Ano`
- `4º Ano`
- `5º Ano`
- `8º Ano`
- `9º Ano`

### `componente`

Aceita:

- `LP`
- `MT`
- `Língua Portuguesa`
- `Matemática`

### `media_pct`

Percentual médio da turma naquele componente.

Exemplo:

- `73.4`

### `alunos_avaliados`

Quantidade de alunos avaliados na turma.

### `hab_criticas`

Quantidade de habilidades críticas da turma naquele componente.

### `classificacao`

Campo opcional.

Se ficar em branco, o sistema calcula automaticamente:

- até 40: `Crítico`
- acima de 40 até 60: `Atenção`
- acima de 60 até 80: `Regular`
- acima de 80: `Adequado`

## Regra de modelagem

Cada linha representa:

- uma turma
- em um componente

Exemplo:

Uma mesma turma pode ter 2 linhas:

- uma para LP
- uma para MT

## Depois de editar a planilha

Rode:

```bash
python build.py
```

Isso vai gerar:

- `dist/data/turmas.json`

E o site passará a usar esses dados na aba de turmas.

