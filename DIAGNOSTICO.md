# Hotel Bons Ventos — Diagnóstico do Modelo Financeiro (Etapa 1–2)

**Arquivo auditado:** `BARR_EVB - R00A11 - HOTELARIA FASEADO 18_17 - R05.xlsx` (título interno: "Hotel Barrinha")
**Documentos de apoio lidos:** Estrutura de Financiamento e Garantias (BNB), Proposta Casamento e Proposta Eventos Saline Taíba (6/out/2026), Book Saline.
**Data do diagnóstico:** 09/10/2026
**Método:** leitura integral das fórmulas (todas as 11 abas, ~184 mil células com fórmula) + valores calculados em cache pelo Excel. Nenhuma fórmula foi recalculada por mim fora do Excel; onde cito "verificado", comparei fórmula e valor em cache. Onde não pude verificar, digo explicitamente.

---

## 1. Estrutura encontrada

| Aba | Função | Dimensão |
|---|---|---|
| **CENARIO** | Única aba de premissas + painel de resultados. Colunas P–AF = Fase 01, AK–BD = Fase 02, BF–BU = Total. Contém também "Realizado" (até a data-base BQ2 = **mar/2026**) e "A Realizar" | 546 linhas |
| **FLUXO EV FASE 01 / FASE 02** | Motor mensal, jan/2024 → abr/2057 (400 meses), 180 colunas. Cada coluna é um item de receita/custo; cada linha um mês. Fase 02 espelha Fase 01 apontando para as colunas AK da CENARIO | 53 mil fórmulas cada |
| **FLUXO EV CONSOLIDADO** | Soma das duas fases via SUMIFS por data | 60 mil fórmulas |
| **DRE FASE 01 / 02 / CONSOLIDADO** | DRE anual (2024–2057) por SUMIFS/OFFSET sobre o fluxo mensal, com KPIs (ocupação, ADR, RevPAR, TRevPAR, GOP, CPOR, break-even) | 118 linhas |
| **IDX** | Séries mensais IGPM/IPCA/INCC/CDI: histórico "Real" + "Projetado" (projeção = média do mesmo mês calendário no histórico) | 2024–2063 |
| **CURVAS** | Curvas S de desembolso: obra (por prazo 12–48 meses), infraestrutura, obra fora da construtora, FF&E, projeto | 55 meses |
| **HISTOGRAMA** | Headcount por cargo × mês × ano de operação (anos 1–6) | 9 cargos |
| **FASEAMENTO** | Vazia | — |

**Sem referências externas, sem circularidades.** Existem ~2.000 nomes definidos lixo (plugin Capital IQ, `HTML_*`) — inofensivos, mas devem ser ignorados pelo parser.

### 1.1 Escopo físico modelado

| | Fase 01 | Fase 02 | Total |
|---|---|---|---|
| Apartamentos | **18** | 17 | **35** |
| Área construída | 1.749 m² | 1.165 m² | 2.914 m² |
| Área privativa | 746 m² (41,5 m²/UH) | 705 m² | 1.451 m² |
| Lugares restaurante | 95 | 105 | 200 |
| Início de obra | ago/2026 | jan/2029 | |
| Prazo de obra | 18 meses | 12 meses | |
| Inauguração | **mar/2028** | fev/2030 | |
| Fim do fluxo / valor terminal | dez/2050 (20 anos após inauguração da Fase 02) | | |

> **Ponto de decisão nº 1:** o prompt fala em "Hotel Bons Ventos" sem mencionar fases; o documento do BNB fala em "dois blocos de apartamentos" e exige que a Fase 1 seja viável sozinha. A plataforma precisa tratar **Fase 01 isolada (18 UH)** como caso-base financiável e Fase 02 como expansão opcional (ano de entrada editável). Confirme se é essa a leitura.

### 1.2 Lógica de cálculo (como o motor funciona hoje)

**Calendário:** coluna `E` = ano de operação (1 na inauguração, +1 a cada 12 meses, limitado a 6 nas tabelas de premissas; a partir do ano 7 repete o ano 6).

**Hospedagem** — dois blocos por mês: *dias normais* e *dias especiais* (feriados/alta estação), cada um com sua curva mês×ano:
- Diárias disponíveis = dias × UH; ocupadas = disponíveis × taxa (matriz mês × ano 1–6).
- Diária média normal = matriz mês × ano, crescendo 10%, 7,5%, 5%, 5%, 5% nos anos 2–6 **e continuando +5% a.a. indefinidamente após o ano 6** (`(1+J50)^(E-6)`).
- Diária especial = matriz própria (R$3.000 em jan/ano 1, R$4.000 em dez), **sem** crescimento após o ano 6.
- Hóspedes = 2 × apto ocupado (fator fixo).
- Share OTA/agências = 0% em todos os meses → comissão de 18% nunca é aplicada.
- ISS e impostos sobre hospedagem: parâmetros K127/K128 = **0** → receita hoteleira sem nenhum tributo sobre faturamento.

**Restaurante** — dias do mês × lugares (120–200 conforme mês, × fator 47,5% Fase 01 / 52,5% Fase 02) × giro (0–2) × ticket (R$120–200). Ticket cresce 5% a.a. até o ano 6 e **congela** depois.
**Eventos** — eventos/mês (0 jan–ago, 1 set–dez) × 250 pessoas × R$450 (+5% a.a. até ano 6, congela depois).
**A&B hóspedes** — diárias ocupadas × R$120 (por apto, não por hóspede), mesmo congelamento.

**Custos:**
- Folha = headcount (HISTOGRAMA) × salário × 1,45 (encargos); PLR = 10% de um "resultado hoteleiro" (receita hotel + A&B hóspedes − folha − diretos − adm − mkt − seguros, excluindo restaurante); "Correção inflacionária" 5% a.a. (ver bug 2.1).
- Despesas de A&B: 14,65% impostos + 27,3% CMV + 15,4% CMO **+ R$180.000/mês fixo** (`K170`), sobre restaurante + eventos + A&B hóspedes.
- Operacionais diretos: internet R$5k, utilities R$30k, manutenção R$7,5k, lavanderia R$25/diária; OTA 18% sobre share (zero).
- Adm/Gerais, Marketing (3% da receita hoteleira + R$3k), Seguros/IPTU: fixos mensais com "correção".

**Impostos sobre lucro:** 22,5% × NOI do mês, se positivo. Não há depreciação, não há regime tributário, não há prejuízo compensável.

**CAPEX:** custo raso de obra (R$11,92M Fase 01 / R$6,97M Fase 02) distribuído pela curva S de 18/12 meses; taxa de administração 10% (defasada 1 mês); general conditions R$66,5k/mês; obra antes da construtora R$500k; infraestrutura R$500k; gerenciamento R$25k/mês pré-obra e R$70k/mês durante obra+4; FF&E (privativo R$45k/UH, área comum, academia R$600k, cozinhas R$859k, taxa adm 6%); projetos/legal R$1,45M; terreno R$1,22M (já pago) + manutenção.

**Valor terminal** ("Valor Patrimonial"): em dez/2050, NOI dos últimos 12 meses × 12 (cap rate 8,33%) — R$237M Fase 01, R$464M consolidado, em valores nominais de 2050.

**Financiamento:** até 4 tranches por fase (datas P270:P273, valores Z270:Z273 — **todos zerados**), juros = índice (IPCA da aba IDX, defasado 2 meses) + 3% a.a., carência 24 meses, prazo total 120 meses, custo de estruturação 1,5%. Ou seja: **o modelo atual é 100% equity; nenhum resultado de dívida foi exercitado.**

**Sócios:** colunas de aporte/retorno para **KAREL, RPE e PASCOAL** (aportes realizados até mar/2026: R$854k / R$849k / R$849k; retorno Karel −R$85k). Não há cap table, % societário nem distribuição modelada — só a soma dos aportes.

**Indicadores:** TIR mensal via `IRR` sobre o "Resultado Mensal" (jan/2024–abr/2057, incluindo valor terminal), anualizada; VPL via `PV` mês a mês a 12% a.a. descontando a partir da data-base mar/2026 (fluxos anteriores não são descontados); payback simples; exposição máxima de caixa; NOI, margem, yield on cost, cap rate, DSCR/ICR (zerados, pois não há dívida).

### 1.3 Resultados que o Excel apresenta hoje (cache)

| Indicador | Fase 01 | Fase 02 | Consolidado |
|---|---|---|---|
| CAPEX total (incl. terreno, projetos, FF&E) | R$ 23,67 M | R$ 11,73 M | R$ 35,40 M |
| Exposição máxima de caixa | −R$ 23,57 M (jun/2028) | −R$ 11,68 M | −R$ 30,38 M (mai/2030) |
| Receita ano estabilizado (2033) | R$ 19,9 M | R$ 19,0 M | R$ 38,9 M |
| NOI 2033 / margem | R$ 9,1 M / 46% | R$ 8,5 M | R$ 17,6 M / 45% |
| Ocupação média (vida) | 54,7% | 54,5% | 54,6% |
| ADR médio (vida, nominal) | R$ 4.582 | R$ 4.793 | R$ 4.679 |
| TIR projeto (nominal, desalavancada, c/ valor terminal) | **22,0% a.a.** | 42,5% | 26,4% |
| VPL @ 12% a.a. | R$ 37,0 M | R$ 42,7 M | R$ 79,7 M |
| Payback simples | ago/2033 (62 meses da exposição máx.) | dez/2032 | jun/2033 |
| Valor terminal dez/2050 | R$ 237 M | R$ 226 M | R$ 464 M |

Atenção: a TIR de 22% depende fortemente do valor terminal nominal de 2050 (R$237M = 56% do resultado acumulado da Fase 01) e de hipóteses que a auditoria abaixo questiona.

---

## 2. Inconsistências e erros identificados

### 2.1 Erros de fórmula (verificados)

| # | Onde | Problema | Impacto |
|---|---|---|---|
| **E1** | `FLUXO EV`!EB (Amortização), ambas as fases | `SUM(INDIRECT("$DY$13:DY"&ROW()-carência-1))` aponta para a coluna **DY, que está vazia** (as tranches estão em DZ). Resultado: amortização sempre = 0; a dívida nunca seria amortizada e os juros acumulariam até 2057. Provavelmente uma coluna foi inserida depois que a fórmula foi escrita. | **Crítico** assim que qualquer tranche for preenchida. Hoje invisível porque tranches = 0. |
| **E2** | `FLUXO EV FASE 02`!FX e `CONSOLIDADO`!FX ("Net Income Distribuível") | `=SUM(DV,AC,#REF!,BD,…)` — 802 células com `#REF!`. | Coluna inutilizável; não alimenta nada hoje. |
| **E3** | Correção inflacionária de todos os grupos de custo (BC, BP, BZ, CE, CJ) | Fórmula `((1+i)^(1-E)-1)` usa expoente **negativo**: aplica `1 − 1,05^−(E−1)` em vez de `1,05^(E−1) − 1`. No ano 3 dá 9,3% vs 10,25%; no ano 20, 60% vs 153%. | Custos operacionais **subestimados em R$24,0M (Fase 01) e R$18,1M (Fase 02)** ao longo do fluxo. NOI de 2050 superestimado em ~25%, o que infla o valor terminal. |
| **E4** | `DRE FASE 01`!A111 (célula de checagem do CAPEX) | Compara com a linha 32 do fluxo em vez da linha 11 → check = −R$23,0M em vez de 0. | Só uma checagem quebrada, mas esconde erros futuros. |
| **E5** | `FLUXO EV FASE 02`!M (diária média) | Usa o contador de ano da **Fase 01** (`'FLUXO EV FASE 01'!E`) para preço, mas o da Fase 02 para ocupação. Provavelmente intencional (tarifa única do hotel), porém a Fase 02 abre já com tarifa de "ano 3". | Deve virar premissa explícita (tarifário único vs. por fase). |
| **E6** | `CENARIO`!B215 / R215 | Fim do fluxo = 20 anos após a inauguração da **Fase 02**; a Fase 01 acaba tendo 22,8 anos. Horizonte real de análise depende da Fase 02 existir. | Horizonte deve ser parâmetro independente por cenário. |

### 2.2 Premissas inconsistentes ou desatualizadas

| # | Tema | Situação no Excel | Observação |
|---|---|---|---|
| **P1** | **Impostos sobre receita hoteleira = 0%** | ISS/PIS/COFINS sobre hospedagem zerados; só A&B paga 14,65%. | Hotelaria paga ISS (2–5%) + PIS/COFINS (3,65% presumido ou 9,25% real). Lacuna de ~6–13% da receita hoteleira (R$20–45M na vida da Fase 01). |
| **P2** | **Imposto sobre lucro = 22,5% × NOI mensal** | Sem depreciação, sem regime (Presumido × Real), sem prejuízo fiscal, sem adicional de IRPJ. | Lucro Presumido para hotel ≈ 32% × (15%+10%+9%) ≈ 10,9% da receita; Lucro Real = 34% do lucro tributável após depreciação e juros. Com financiamento BNB, os juros são dedutíveis — o modelo não captura. **Nova premissa obrigatória.** |
| **P3** | **Sem depreciação** | Nem contábil nem fiscal. | Necessária para DRE, EBIT, lucro líquido, imposto e valuation por múltiplo. |
| **P4** | **Sem capital de giro, sem reserva de FF&E / manutenção** | Nenhuma linha. | Padrão hoteleiro: FF&E reserve 3–5% da receita a partir do ano 3; capital de giro ~15–30 dias de receita. |
| **P5** | **Sem taxa de gestão/administração hoteleira, pré-abertura, treinamento** | Nenhuma linha. | Se a operação for própria (RPE), ao menos custo corporativo; se terceirizada, base fee + incentive fee. |
| **P6** | **A&B com margem praticamente nula** | Despesas diretas de A&B = **87,5% da receita de A&B** (R$143M/R$164M na Fase 01) **antes** da folha de cozinha/bar (R$18M, lançada na folha do hotel). Resultado: A&B gera ~R$2M em 23 anos. O CMO fixo de R$180k/mês (R$2,16M/ano) parece **dobrar** com Chefe de Cozinha, Chefe Jr, Auxiliares, Chefe de Bar, Barman/Garçom na folha. | Ou o A&B está super-custeado (dupla contagem) ou a receita está subdimensionada. Precisa ser reconciliado com o padrão real dos restaurantes RPE (CMV 27,3% / CMO 15,4% já vêm do grupo). |
| **P7** | **Crescimento de preços assimétrico** | Diária normal cresce 5% a.a. para sempre; diária especial, ticket de restaurante, eventos e A&B congelam no ano 6; custos crescem a 5% (com o bug E3). | O modelo mistura fluxo nominal com fluxo "real" por linha. Resultado: margem de A&B se deteriora artificialmente, margem hoteleira infla. Decisão: modelar tudo em nominal com inflação única ou tudo em real. |
| **P8** | **Hóspedes fixos em 2 por UH; A&B hóspede por diária, não por hóspede** | Ticket R$120/diária. | Para casamentos (buyout com 46+ pessoas) a lógica por hóspede é necessária. |
| **P9** | **Eventos: 1 por mês set–dez, 250 pessoas, R$450** | Sem buyout, sem retirada de apartamentos da disponibilidade, sem locação de espaço, sem catering próprio × terceirizado. | Módulo de casamentos precisa ser construído do zero (Fase 2 do prompt). Hoje eventos = 2,4% da receita. |
| **P10** | **Distribuição OTA = 0%** | Comissão de 18% existe mas nunca incide. | Prompt pede receita direta × intermediada. |
| **P11** | **Datas desatualizadas** | Data-base "Realizado" = mar/2026; início de obra = **ago/2026** (já passou); inauguração mar/2028. Hoje é out/2026 e o BNB ainda está em análise técnica. | Cronograma precisa ser re-datado (obra provavelmente 2027–2028, inauguração 2029?). Impacta tudo. |
| **P12** | **CAPEX não concilia com o BNB** | Excel Fase 01: obra R$17,99M + FF&E R$2,68M + projetos R$1,45M + terreno R$1,56M = **R$23,67M**; Fase 02 **R$11,73M**; total **R$35,4M**. BNB: construção civil **R$19,706M** + equipamentos **R$3,294M** = **R$23,0M** (financiável 90% = R$20,7M). | Não está claro se os R$19,706M do BNB cobrem 18 ou 35 UH, nem se incluem gerenciamento/general conditions/taxa de administração. Custo raso consolidado (18,88M) + general conditions (≈1,2M) ≈ 20M sugere que o BNB olha o projeto inteiro. **Precisa de resposta sua.** |
| **P13** | **Valor terminal = 12 × NOI nominal de 2050** | Equivale a cap rate 8,33% sobre NOI inflado por 5% a.a. por 22 anos, sem desconto por idade do ativo nem capex de renovação. | 56% do resultado da Fase 01 vem dessa célula. Prompt pede DCF com perpetuidade/múltiplo de saída editável + múltiplo de EBITDA — valor terminal deve ser sensibilizado. |
| **P14** | **Desconto do VPL a partir de mar/2026** | Fluxos 2024–mar/2026 entram sem desconto; TIR calculada desde jan/2024 incluindo gastos já realizados (R$2,47M). | Para o novo investidor, o fluxo relevante começa na data do aporte; para o projeto, desde o início. Precisa de duas bases ("TIR histórica" × "TIR a realizar"). |
| **P15** | **Índices (IDX) projetados pela média do mesmo mês** | Gera IPCA negativo em agosto de 2048, por exemplo. | Trocar por premissa de inflação anual editável (ou curva Focus). |
| **P16** | **Juros do financiamento: IPCA + 3% a.a.** | Hipótese não documentada; BNB/FNE hoje opera com TFNE (base + bônus de adimplência) e condições por porte/região. | Tratar como hipótese pendente de validação. |
| **P17** | **PLR = 10% de um "GOP hoteleiro"** | Somando R$30,7M na Fase 01 (36% da folha). Base exclui restaurante. | Confirmar política; parametrizar. |
| **P18** | **Ocupação de dias especiais da Fase 01 ano 1 = 100% em jan** e em alguns meses 0% (mar, mai, jul, ago) por ter 0 dias especiais. | Mistura "dias especiais" com "feriados" sem calendário. | O módulo de hotelaria deve ter sazonalidade mensal + feriados opcionais, mais simples de auditar. |
| **P19** | **Benchmark Saline** | ADR Saline 2028 por buyout = R$76.050/22 UH = **R$3.457/UH** (2 pessoas, café incluso, impostos inclusos). Excel Bons Ventos: diária normal ano 1 R$2.200–2.500, especial R$3.000–4.000, crescendo a R$2.600–3.400 no ano 3 (2030). | Coerente em ordem de grandeza (Bons Ventos abaixo do Saline, que é referência consolidada); ocupação Saline 65–70% vs. Excel 55% média. A ser parametrizado nos três cenários. |

### 2.3 O que NÃO existe no modelo e o prompt exige (novas premissas)

1. Módulo de casamentos/buyout com retirada de UH da disponibilidade (sem dupla contagem), 3 fases comerciais, receitas incrementais (locação, welcome party, catering, bebidas, pool party, consumo).
2. Beach club / day-use / visitantes externos com fechamento em buyout.
3. Regime tributário, depreciação, capital de giro, FF&E reserve.
4. Financiamento BNB funcional: cronograma de desembolso, juros durante a obra capitalizados ou pagos, SAC/Price, carência, TFNE/bônus, seguros, DSCR por período, covenants.
5. Garantias: preexistente 80% do financiamento (R$16,56M), imóvel R$6,025M, complementação R$10,535M, garantia evolutiva pela obra, fiança bancária proporcional às liberações (ex.: 64%), liberação após início da operação — e a remuneração 1,0/1,5/2,0% a.a. nos modelos A/B/C.
6. Cap table (pré/pós-money, terreno como ativo, aportes já realizados de Karel/RPE/Pascoal, novo investidor), distribuições, TIR/VPL/MOIC por sócio, análise reversa de participação.
7. Valuation por DCF (perpetuidade ou múltiplo) e por múltiplo de EBITDA.
8. Sensibilidades, tornado, heatmaps, alertas.
9. Rastreabilidade de origem (Excel original / documento / hipótese).

---

## 3. Melhorias recomendadas (ordem de prioridade)

1. **Corrigir E1 e E3** antes de qualquer uso do Excel com dívida — são erros matemáticos, não opções de premissa.
2. **Unificar a base monetária**: fluxo nominal com uma inflação de referência editável (IPCA) e crescimentos reais por linha (ADR real, ticket real, custo real). Isso resolve P7, P15 e torna o valor terminal defensável.
3. **Separar hotel e A&B em centros de resultado completos** (receita, impostos, CMV, folha própria, custos diretos, margem de contribuição) e eliminar a dupla contagem de cozinha (P6).
4. **Camada fiscal explícita**: Presumido × Real, ISS municipal (Acaraú), PIS/COFINS, IRPJ+adicional, CSLL, depreciação (obra 25 anos, FF&E 10 anos), juros dedutíveis.
5. **Re-datar o cronograma** e separar "realizado" (R$2,47M + terreno) de "a realizar"; calcular TIR total e TIR do investidor novo separadamente (XIRR com datas).
6. **Hotelaria por categorias de UH** (tipologia × tarifa × capacidade) em vez de uma diária média única, com sazonalidade mensal, ramp-up por cenário e mix direto/OTA.
7. **Valor terminal**: DCF com crescimento na perpetuidade + alternativa por múltiplo de EBITDA, ambos editáveis; mostrar o peso do terminal no VPL.
8. **Horizonte** de 15 anos ajustável (o Excel usa ~23), com valor residual.

---

## 4. Arquitetura de cálculo proposta

```
┌──────────────────────────────────────────────────────────────┐
│ 3. UI (Next.js + TypeScript + Tailwind + Recharts)            │
│    Overview · Dashboard · Hotelaria · Weddings · Gastronomia  │
│    · BNB · Equity · Investor Returns · Scenario Lab · Deck    │
├──────────────────────────────────────────────────────────────┤
│ 2. Data & Assumptions (Zustand/IndexedDB → Supabase opcional) │
│    Scenario { assumptions, provenance: 'excel'|'doc'|'hyp',  │
│               status: 'original'|'revised'|'pending' }        │
│    Cenários: Excel-R05 (congelado, só leitura) · Base ·       │
│              Conservador · Otimista · custom…                 │
├──────────────────────────────────────────────────────────────┤
│ 1. Financial Engine (TypeScript puro, sem dependência de UI)  │
│    calendar → hotel → weddings(buyout) → f&b/beach → opex     │
│    → capex → tax → debt(BNB) → guarantees → equity/waterfall  │
│    → statements (DRE, FC mensal/anual, dívida, cap table)     │
│    → metrics (XIRR/XNPV, payback, MOIC, DSCR, ROIC, valuation)│
│    → sensitivity (grid, tornado) → audit trace (DAG de deps)  │
└──────────────────────────────────────────────────────────────┘
```

Princípios:
- **Motor determinístico e puro** (`compute(scenario) → Results`): cada módulo é uma função; o grafo de dependência é explícito, o que permite a função de auditoria ("quais premissas influenciam este indicador") sem instrumentação extra.
- **Fluxo mensal** como no Excel (grão necessário para buyouts, carência e DSCR), agregado em anual para exibição.
- **Cenário "Excel R05 (original)"**: o motor reproduz a lógica atual *com os bugs sinalizados*, para conciliação; um toggle "aplicar correções" mostra o efeito de E1/E3. Relatório de conciliação automático = diferença linha a linha vs. os valores em cache do Excel.
- **Datas efetivas** em todos os fluxos; XIRR/XNPV próprios (Newton + bisseção) com testes contra casos conhecidos.
- **Dupla contagem de buyout** tratada na fonte: o módulo de casamentos devolve `roomNightsBlocked[month]`, que o módulo de hotelaria subtrai da disponibilidade antes de aplicar a ocupação.
- **Garantias** como objeto próprio (valor comprometido por mês, redução/liberação, fee, modelo A/B/C) que gera linhas no fluxo do projeto e no fluxo do garantidor.
- Exportação Excel (SheetJS) e PDF (print CSS + html2canvas) a partir dos mesmos objetos de resultado.

---

## 5. Decisões necessárias antes da Etapa 3

1. **Escopo:** caso-base = Fase 01 (18 UH) isolada, com Fase 02 como opção? Ou o BNB avalia o projeto completo de 35 UH?
2. **CAPEX de referência:** os R$19,706M do BNB cobrem qual escopo e quais itens? Devo partir do CAPEX do Excel (R$23,67M F1 / R$35,4M total) e marcar o BNB como "em validação", ou o inverso?
3. **Cronograma:** nova data de início de obra e inauguração (o Excel diz ago/2026, já passado).
4. **Sócios atuais:** quem são Karel / RPE / Pascoal, participação atual de cada um, e o que já foi aportado além dos R$2,55M registrados (o terreno de R$1,22M entra como aporte de quem?).
5. **Regime tributário** pretendido (Presumido × Real) e alíquota de ISS de Acaraú — se não souber, modelo os dois e marco como hipótese.
6. **A&B:** confirmar se os R$180k/mês de CMO fixo são adicionais à folha de cozinha/bar ou se há dupla contagem.
7. **Operação:** própria (RPE) ou operador terceiro com fee?

Com essas respostas consolido as premissas (Etapa 3) e começo o motor de cálculo (Etapa 4). Se preferir que eu siga sem esperar, assumo: Fase 01 como caso-base com Fase 02 opcional, CAPEX do Excel como premissa original e BNB como revisão pendente, obra iniciando jan/2027, regime Presumido com alternativa Real, dupla contagem de cozinha eliminada — tudo marcado como "hipótese" na plataforma.
