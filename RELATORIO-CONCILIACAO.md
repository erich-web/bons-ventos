# Hotel Bons Ventos — Relatório de conciliação: Excel R05 × plataforma

**Data:** 09/10/2026 · **Arquivo:** `BARR_EVB - R00A11 - HOTELARIA FASEADO 18_17 - R05.xlsx` · **Motor:** `src/engine/compute.ts` (cenário "Excel R05 (original)")

## 1. Método
O cenário "Excel R05" da plataforma usa exatamente as premissas extraídas da planilha (`src/data/excel-r05.json`, gerado por `scripts/extract_excel.py`) e reproduz a lógica de cálculo original, **inclusive os erros identificados** (modos `rateLongTermMode: 'excel'`, `inflationMode: 'excel'`, `tax.regime: 'excelNOI'`, CAPEX pelas séries mensais originais). Os resultados foram comparados com os valores em cache da planilha (abas FLUXO EV FASE 01/02/CONSOLIDADO, 400 meses × 180 colunas) por um conjunto de 39 testes automatizados (`tests/engine.test.ts`, `npx vitest run`: 39/39 aprovados).

## 2. Resultado da conciliação (consolidado Fase 01 + Fase 02, jan/2024–dez/2050)

| Linha | Plataforma | Excel | Diferença | % |
|---|---:|---:|---:|---:|
| Receita de hospedagem | R$ 715,488 M | R$ 715,488 M | 0 | 0,000% |
| Restaurante | 278,336 | 278,336 | 0 | 0,000% |
| Eventos | 24,500 | 24,500 | 0 | 0,000% |
| A&B hóspedes | 22,781 | 22,781 | 0 | 0,000% |
| Folha de pagamento | 159,982 | 159,982 | 0 | 0,000% |
| Despesas de A&B | 281,242 | 281,242 | 0 | 0,000% |
| Operacionais diretos | 35,850 | 35,850 | 0 | 0,000% |
| Administrativas / gerais | 10,604 | 10,619 | −15,6 mil | −0,147% |
| Marketing | 23,623 | 23,623 | 0 | 0,000% |
| Seguros e IPTU | 2,111 | 2,111 | 0 | 0,000% |
| NOI | 527,699 | 527,679 | +20 mil | 0,004% |
| Impostos (22,5% × NOI) | 126,943 | 126,952 | −9 mil | −0,007% |
| CAPEX (obra + FF&E + projetos + terreno) | 35,398 | 35,398 | 0 | −0,001% |
| Valor terminal (dez/2050) | 463,620 | 463,620 | 0 | 0,000% |
| **Resultado acumulado** | **828,969** | **828,950** | **+19 mil** | **0,002%** |

Fluxo mensal: diferença máxima de R$ 3,2 mil em um único mês; nos demais, < R$ 1,2 mil.

| Indicador | Plataforma | Excel |
|---|---:|---:|
| TIR consolidada (nominal) | 26,42% a.a. | 26,41% a.a. |
| TIR Fase 01 isolada | 22,05% a.a. | 22,05% a.a. |
| Valor terminal Fase 01 | R$ 237,25 M | R$ 237,25 M |
| Exposição máxima Fase 01 | −R$ 23,57 M (jun/2028) | −R$ 23,57 M (jun/2028) |
| Payback Fase 01 | ago/2033 | ago/2033 |
| Payback consolidado | jul/2033 | jun/2033 (convenção de contagem do Excel; o acumulado cruza zero em jul/2033 em ambos) |
| VPL consolidado @12% — convenção do Excel (PV mensal a partir de mar/2026) | R$ 79,68 M | R$ 79,66 M |
| VPL consolidado @12% — XNPV com datas efetivas (plataforma) | R$ 79,22 M | — |

**Diferenças explicadas:** (a) honorário contábil pré-operacional da Fase 02 (R$ 1.200/mês durante a obra, R$ 15,6 mil) não replicado — a plataforma trata honorários como custo de operação; (b) VPL: a plataforma usa XNPV com datas efetivas e capitaliza até a data-base os fluxos anteriores a ela, o Excel não desconta fluxos anteriores a mar/2026 (−0,55% no VPL, 0 na TIR); (c) payback: o Excel conta meses com acumulado ≤ 0 a partir do mês de exposição máxima (fórmula `EDATE(P350, COUNTIFS(...))`), produzindo um mês a menos que a leitura direta do acumulado.

## 3. Erros do Excel e seu efeito

| Código | Erro | Tratamento na plataforma |
|---|---|---|
| E1 | Amortização da dívida referencia a coluna DY (vazia); com tranches preenchidas a dívida nunca amortiza | Módulo de dívida próprio (SAC/Price, carência, tranches ou pró-rata) |
| E2 | 802 células `#REF!` em "Net Income Distribuível" (Fase 02 e consolidado) | Linha recalculada (`netIncome` anual) |
| E3 | Correção inflacionária com expoente invertido `(1+i)^(1−ano)−1` — custos subestimados em R$ 24,0 M (F1) e R$ 18,1 M (F2) | `opex.inflationMode: 'compound'` nos cenários revisados |
| E4 | Checagem de CAPEX na DRE aponta para a linha errada | — (checagem substituída por testes) |
| E5 | Diária da Fase 02 segue o ano de operação da Fase 01 | Parâmetro `rateCalendar` ('phase1' = Excel, 'own') |
| E6 | Horizonte depende da inauguração da Fase 02 | `calendar.horizonYears` por cenário |
| **E7** | Diária normal multiplicada por `(1+5%)^(ano−6)` em todos os anos: deflaciona a tarifa em 22% no ano 1, 18% no ano 2 … até 0 no ano 6 | `hotel.rateLongTermMode: 'correct'` |

Efeito das correções sobre a réplica (demais premissas iguais):

| Variante | TIR projeto | VPL @12% (XNPV) | NOI 2033 | Valor terminal |
|---|---:|---:|---:|---:|
| Réplica Excel R05 (com erros) | 26,42% | R$ 79,2 M | R$ 17,6 M | R$ 464 M |
| + correção E3 (inflação composta) | 25,92% | R$ 71,5 M | R$ 17,4 M | R$ 400 M |
| + correção E7 (diária sem deflação) | 27,50% | R$ 82,0 M | R$ 17,6 M | R$ 464 M |
| + E3 e E7 | 27,03% | R$ 74,3 M | R$ 17,5 M | R$ 400 M |

## 4. Mudanças de premissa nos cenários revisados (Base / Conservador / Otimista)
Em relação ao Excel: horizonte de 15 anos de operação (Excel: até 2050) com valor terminal por perpetuidade (g = 3%) em vez de NOI × 12; regime Lucro Presumido com ISS 5% e PIS/COFINS 3,65% sobre hospedagem (Excel: 0% sobre receita hoteleira e 22,5% × NOI); depreciação, capital de giro, reserva de FF&E (3% a partir do ano 3), pré-abertura (R$ 600 mil), custo corporativo (R$ 25 mil/mês); tipologia de UH; ocupação com ramp-up 42% → 63% e sazonalidade; 35% de distribuição intermediada a 18%; custo variável por diária R$ 60; A&B: CMO fixo de R$ 180 mil/mês substituído por quadro de pessoal por cargo (hotel / A&B / adm) com extras por diária e por casamento, tickets indexados após o ano 6, consumo de hóspedes por hóspede-noite; módulo de casamentos (6 → 18/ano, buyout 3 diárias, fases comerciais) e beach club; financiamento BNB (R$ 20,7 M contratado, desembolso 90% do CAPEX elegível, IPCA + 2,95% com bônus 15%, 36 meses de carência, 15 anos, SAC) e Fase 02 com rodada própria; garantias (80% do saldo, imóvel R$ 6,025 M, complementação do investidor a 1,5% a.a.); cap table Karel 40 / RPE 30 / Pascoal 30, investidor R$ 2,3 M a pré-money de R$ 9 M; taxas de desconto 14% (projeto) e 18% (equity). Todas marcadas como `revised` ou `pending` no registro de premissas.

Resultados (valores nominais):

| Cenário | CAPEX | Dívida | Receita estab. | EBITDA estab. | Ocup. / ADR | TIR projeto | VPL @14% | TIR equity | Payback | DSCR mín | TIR / MOIC investidor |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| Base | 35,4 | 27,2 | 48,3 | 22,1 (46%) | 65% / 3.360 | 34,2% | 75,2 | 51,5% | dez/2031 | 2,83× | 52,8% / 29,3× |
| Conservador | 38,6 | 29,0 | 42,2 | 18,1 (43%) | 57% / 3.031 | 28,0% | 52,2 | 40,5% | dez/2032 | 1,69× | 44,7% / 23,2× |
| Otimista | 35,4 | 27,2 | 55,2 | 26,5 (48%) | 71% / 3.750 | 39,0% | 97,6 | 59,6% | ago/2031 | 3,71× | 60,9% / 36,0× |

**Leitura crítica (CFO):** os retornos permanecem muito acima do padrão de mercado para hotelaria (yield on cost de 35–40% contra 8–12% usuais) porque herdam do Excel um CAPEX de ≈ R$ 1,3 M por UH combinado a diárias de R$ 2,2–4,0 mil e 55–65% de ocupação. Antes da apresentação a investidores recomenda-se validar o CAPEX com o orçamento executivo (o BNB já analisa R$ 19,7 M de obra) e testar o heatmap CAPEX × ADR; a plataforma sinaliza isso nas notas das páginas.
