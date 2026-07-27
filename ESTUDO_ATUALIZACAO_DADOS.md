# Estudo de atualização dos dados do projeto

## 1. Resumo executivo

Hoje o projeto já permite atualizar boa parte do site apenas trocando arquivos Excel e executando o build. Porém isso só funciona bem para os blocos que já estão implementados:

- habilidades
- visão geral
- detalhamento
- escolas

A área de **turmas** ainda não está implementada no site estático atual, mesmo existindo uma função antiga no backend para isso.

O ponto mais importante do estudo é este:

- o site publicado em GitHub Pages usa **somente arquivos JSON gerados pelo `build.py`**
- esses JSONs são montados a partir de **3 planilhas Excel** em `backend/data/`
- o backend FastAPI existe, mas **não é o motor do site publicado**

Então, para atualizar os dados do site hoje, o caminho real é:

1. editar as planilhas Excel em `backend/data/`
2. rodar `python build.py`
3. publicar o resultado no repositório

## 2. Arquitetura real do projeto

### 2.1. Fluxo que vale para GitHub Pages

O fluxo ativo do site publicado é:

`Excel -> build.py -> dist/data/*.json -> frontend/script.js -> GitHub Pages`

Arquivos principais:

- [build.py](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/build.py)
- [frontend/script.js](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/frontend/script.js)
- [frontend/index.html](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/frontend/index.html)

### 2.2. Backend existente

Existe um backend FastAPI em:

- [backend/main.py](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/backend/main.py)
- [backend/services/data_service.py](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/backend/services/data_service.py)

Mas o frontend atual publicado não consome `/api/...`. Ele busca diretamente:

- `data/habilidades.json`
- `data/desempenho.json`
- `data/analise.json`

Isso aparece em [frontend/script.js](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/frontend/script.js).

Conclusão:

- o backend serve como versão antiga/local da lógica
- o GitHub Pages depende do `build.py`, não do FastAPI

## 3. Fontes de dados atuais

As planilhas atuais ficam em:

- [backend/data/DADOS_ACERTO_POR_HABILIDADE.xlsx](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/backend/data/DADOS_ACERTO_POR_HABILIDADE.xlsx)
- [backend/data/desempenho_por_ano.xlsx](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/backend/data/desempenho_por_ano.xlsx)
- [backend/data/desempenho_por_ano_analise.xlsx](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/backend/data/desempenho_por_ano_analise.xlsx)

## 4. O que cada planilha controla

### 4.1. `DADOS_ACERTO_POR_HABILIDADE.xlsx`

Essa é a planilha mais importante do projeto. Ela alimenta:

- filtros de escola, ano e componente
- cards de habilidades
- gráfico de desempenho por habilidade
- distribuição por faixa
- rankings de menor/maior desempenho
- tabela detalhada
- indicadores gerais

Colunas esperadas pelo sistema:

1. avaliação
2. rede
3. ano escolar
4. componente curricular
5. entidade/escola
6. habilidade - posição (código)
7. habilidade - descrição
8. habilidade - acerto %
9. nível de dificuldade da habilidade

Transformações aplicadas no código:

- `LP` vira `Língua Portuguesa`
- `MT` vira `Matemática`
- o ano é extraído por regex para formatos como `2º Ano`, `4º Ano`, `8º Ano`
- o código da habilidade é quebrado em:
  - `habilidade_pos` ex.: `H01`
  - `habilidade_descritor` ex.: `D001_P`
- a faixa é calculada automaticamente:
  - `<= 40`: Crítico
  - `<= 60`: Atenção
  - `<= 80`: Intermediário
  - `> 80`: Adequado

### 4.2. `desempenho_por_ano.xlsx`

Essa planilha controla a base resumida por escola e ano.

Ela alimenta:

- comparações por escola
- médias LP e MT por escola
- base histórica usada pela antiga lógica de turmas no backend

Colunas esperadas após pular 2 linhas do topo:

1. escola
2. ano escolar
3. língua portuguesa (%)
4. matemática (%)
5. média geral (%)

Observação importante:

- o código ignora as duas primeiras linhas e assume que a tabela começa logo depois
- se o layout dessa planilha mudar, o build quebra

### 4.3. `desempenho_por_ano_analise.xlsx`

Essa planilha controla a parte mais “analítica” da página de escolas.

Ela alimenta:

- ranking geral das escolas
- comparativo LP × Matemática por escola
- gráfico por etapa
- habilidades críticas por escola
- heatmap escola × etapa
- média da rede
- classificação da escola

Colunas esperadas após ler a planilha com `header=1`:

1. escola
2. ano escolar
3. lp_pct
4. mt_pct
5. media_geral
6. gap_lp_mat
7. vs_rede
8. media_escola
9. classificacao
10. hab_criticas

Observações críticas:

- a linha que começa com `Média...` é tratada como média da rede
- `classificacao` e `hab_criticas` **não são recalculadas pelo sistema**
- isso significa que essas duas informações precisam vir prontas da planilha

## 5. O que já pode ser atualizado só por planilha

Hoje, sem mexer em código, você já consegue atualizar:

### 5.1. Percentuais de habilidade

Basta editar:

- [backend/data/DADOS_ACERTO_POR_HABILIDADE.xlsx](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/backend/data/DADOS_ACERTO_POR_HABILIDADE.xlsx)

Campos mais sensíveis:

- habilidade - acerto %
- escola
- ano escolar
- componente

### 5.2. Descrição ou código das habilidades

Também basta editar a mesma planilha:

- `Habilidade - Posição (Código)`
- `Habilidade - Descrição`

Mas há uma condição:

- o código precisa continuar em um formato que o regex entenda, como `H 01 (D001_P)`

Se esse padrão for quebrado, o site perde:

- posição da habilidade
- descritor
- ordenação correta

### 5.3. Resultados por escola/ano

Basta editar:

- [backend/data/desempenho_por_ano.xlsx](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/backend/data/desempenho_por_ano.xlsx)
- [backend/data/desempenho_por_ano_analise.xlsx](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/backend/data/desempenho_por_ano_analise.xlsx)

### 5.4. Classificação das escolas

Também pode ser atualizada por planilha, mas hoje precisa vir pronta em:

- `desempenho_por_ano_analise.xlsx`

Ou seja:

- se quiser mudar a regra de classificação, precisa mexer no processo que gera essa planilha
- o projeto atual apenas lê o valor

## 6. O que ainda não está resolvido no projeto

## 6.1. Turmas não estão implementadas no frontend atual

Na interface, a aba de turmas está só como placeholder em:

- [frontend/index.html](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/frontend/index.html)

Na lógica do frontend, a aba `turmas` não carrega dados:

- [frontend/script.js](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/frontend/script.js)

Hoje ela faz literalmente isso:

- `turmas: () => {}`

Ou seja:

- não existe `turmas.json`
- não existe leitura de planilha de turmas no `build.py`
- não existe renderização de gráfico/tabela de turmas no site estático

### 6.2. Existe uma lógica antiga de turmas no backend, mas ela não representa turmas reais

Em [backend/services/data_service.py](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/backend/services/data_service.py), a função `get_graficos_turmas()` usa `desempenho_por_ano.xlsx`.

Na prática, ela monta rótulos:

- `Escola - Ano`

Isso não é turma de verdade. É:

- agregação por escola + ano

Então, se você quiser resultado real por turma, o projeto precisa de nova modelagem de dados.

## 7. Dependências e fragilidades atuais

## 7.1. Nomes e formatos rígidos

O projeto depende de:

- nomes exatos dos arquivos
- posição exata das colunas
- linhas de cabeçalho em posições fixas
- siglas `LP` e `MT`
- padrão textual das habilidades

Se qualquer um desses itens mudar, o build pode quebrar ou gerar dados errados.

## 7.2. Duplicação de lógica

Há a mesma ideia de transformação em dois lugares:

- [build.py](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/build.py)
- [backend/services/data_service.py](C:/Users/paulo/Dropbox/Codex/paineldadosavalie2026.2/backend/services/data_service.py)

Isso aumenta o risco de divergência.

## 7.3. Parte das métricas vem pronta da planilha

Especialmente na análise por escola:

- classificação
- habilidades críticas
- vs rede
- média da escola

Isso quer dizer que o sistema não é totalmente “autocálculo”; parte da inteligência já precisa vir consolidada da origem.

## 8. Se você quiser apenas atualizar dados sem mexer no sistema

O mínimo necessário hoje é:

### Processo operacional atual

1. editar os 3 arquivos Excel em `backend/data/`
2. manter o mesmo formato de colunas e cabeçalhos
3. rodar:

```bash
python build.py
```

4. revisar a pasta `dist/`
5. subir as mudanças para o GitHub

### O que esse processo já resolve

- novos percentuais
- novas habilidades
- ajustes de descrição
- nova média por escola/ano
- nova análise de escolas

### O que esse processo não resolve sozinho

- resultados reais por turma
- validação automática da qualidade dos dados
- edição segura por alguém sem conhecer a estrutura das planilhas

## 9. O que eu implementaria para deixar o projeto realmente fácil de atualizar

## Opção A — melhoria mínima e prática

Criar um **modelo oficial de planilhas** e manter o fluxo atual.

### Implementações

1. criar uma pasta `templates/` com planilhas-modelo
2. criar um `README` de atualização de dados
3. adicionar validações no `build.py` para:
   - checar colunas obrigatórias
   - checar siglas válidas
   - checar formato do código da habilidade
   - avisar linhas inválidas
4. gerar relatório de erros amigável no build

### Vantagens

- implementação rápida
- baixo risco
- continua compatível com o projeto atual

### Desvantagens

- ainda depende de 3 planilhas
- turmas continuam sem solução

## Opção B — melhor solução para operação

Criar **uma base única padronizada** e automatizar os derivados.

### Estrutura sugerida

#### Planilha 1: `habilidades_base.xlsx`

Com colunas como:

- avaliacao
- rede
- escola
- ano_escolar
- componente
- habilidade_codigo
- habilidade_descritor
- habilidade_pos
- habilidade_descricao
- acerto_pct
- nivel_dificuldade

#### Planilha 2: `turmas_base.xlsx`

Com colunas como:

- escola
- turma
- ano_escolar
- componente
- media_pct
- alunos_avaliados
- opcionalmente habilidade_codigo
- opcionalmente acerto_pct por habilidade

#### Planilha 3: `escolas_base.xlsx` (opcional)

Se quiser manter classificações prontas:

- escola
- ano_escolar
- lp_pct
- mt_pct
- media_geral
- classificacao
- hab_criticas

Ou então o sistema pode calcular isso sozinho.

### Implementações

1. reescrever o `build.py` para ler uma estrutura única e validada
2. fazer o próprio build calcular:
   - média da rede
   - média por escola
   - habilidades críticas
   - classificação
3. gerar:
   - `habilidades.json`
   - `desempenho.json`
   - `analise.json`
   - `turmas.json`
4. implementar a aba de turmas no frontend

### Vantagens

- atualização muito mais consistente
- menos retrabalho manual
- menos chance de divergência entre planilhas
- permite crescer no futuro

### Desvantagens

- exige refatoração real
- precisa testar bem

## Opção C — melhor experiência para usuário final

Criar um painel de “subir planilha” ou usar Google Sheets como origem.

### Implementações possíveis

1. tela administrativa para upload de planilha
2. validação automática
3. geração automática dos JSONs
4. publicação automática

Ou:

1. usar Google Sheets como base
2. script de exportação para JSON
3. deploy automático no GitHub Pages

### Quando vale a pena

- quando várias pessoas vão atualizar os dados
- quando a atualização será frequente

## 10. O que precisa ser implementado para suportar resultados reais por turma

Se o seu objetivo inclui **resultados por turma**, hoje falta:

1. uma fonte de dados por turma
2. uma planilha dedicada de turmas
3. leitura dessa planilha no `build.py`
4. geração de `turmas.json`
5. tela real de turmas no frontend
6. filtros por:
   - escola
   - ano
   - turma
   - componente
7. gráficos e/ou tabela dessa aba

### Estrutura mínima recomendada para turmas

Colunas:

- escola
- turma
- ano_escolar
- componente
- media_geral
- lp_pct
- mt_pct
- hab_criticas

Se quiser aprofundar:

- habilidade_codigo
- habilidade_descricao
- acerto_pct

## 11. Recomendação objetiva

Se a sua prioridade é **atualizar rapidamente sem complicar**, eu recomendo:

### Fase 1

- manter os 3 Excels atuais
- reforçar o `build.py` com validação
- documentar o formato oficial

### Fase 2

- implementar a aba de turmas com uma planilha dedicada

### Fase 3

- unificar a origem dos dados e automatizar cálculos derivados

## 12. Conclusão final

Hoje o projeto já suporta atualização de:

- percentuais de habilidade
- descrições de habilidade
- resultados por escola/ano
- análise por escola

Tudo isso pode ser atualizado só por planilha, desde que você edite corretamente os arquivos em `backend/data/` e rode o `build.py`.

Mas, para ficar realmente robusto e fácil de operar, o projeto ainda precisa de:

1. validação automática de planilhas
2. documentação de formato
3. implementação real da aba de turmas
4. preferência por uma estrutura única ou mais padronizada de dados

## 13. Resposta curta para a pergunta principal

Se você me perguntasse “o que eu preciso para atualizar todos os dados do site?”, a resposta prática seria:

- hoje: editar os Excels em `backend/data/` e rodar o build
- para habilidades: editar `DADOS_ACERTO_POR_HABILIDADE.xlsx`
- para escolas/anos: editar `desempenho_por_ano.xlsx`
- para análise das escolas: editar `desempenho_por_ano_analise.xlsx`
- para turmas reais: ainda precisa implementar nova fonte + nova aba + novo JSON

