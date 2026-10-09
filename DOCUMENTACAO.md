# Hotel Bons Ventos — Documentação técnica da plataforma

Versão 1 · 09/10/2026 · motor financeiro conciliado com `BARR_EVB - R00A11 - HOTELARIA FASEADO 18_17 - R05.xlsx`

## 1. Arquitetura

```
src/engine/        Financial Engine (TypeScript puro, sem React)
  types.ts         Scenario (premissas) e Results (saídas) — schema único de dados
  compute.ts       compute(scenario) → Results: motor mensal determinístico (~10 ms)
  finance.ts       IRR/NPV periódicos, XIRR/XNPV com datas, payback, PMT, bisseção
  analysis.ts      overrides, sensibilidade (tornado, heatmap), break-even, análise reversa, modelos de garantia
  scenarios.ts     cenários: Excel R05 (réplica), Base, Conservador, Otimista; estruturas BNB A/B/C; quadro de pessoal
  trace.ts         grafo de rastreabilidade indicador → fórmula → premissas
  calendar.ts      utilidades de datas (YYYY-MM), grades ano × mês, crescimento
src/data/excel-r05.json   premissas e séries mensais extraídas do Excel (origem: excel)
src/store/scenarios.ts    Data & Assumptions: cenários persistidos (localStorage), proveniência, propostas
src/pages/*               UI (10 páginas + Auditoria)
src/components/*          kit de componentes (Ledger, Field, GridEditor, TraceDrawer, Tornado, Heatmap…)
src/lib/export.ts         exportação Excel (SheetJS), PDF (jsPDF), PNG, JSON; capacidade `downloads` do viewer
tests/engine.test.ts      39 testes: conciliação com o Excel, finanças, consistência estrutural, estresse, análise reversa
scripts/extract_excel.py  extração do Excel → JSON (reprodutível)
```

Camadas: (1) Financial Engine — funções puras; (2) Data & Assumptions — `Scenario` com `provenance` por caminho (`excel` | `doc` | `hypothesis`, status `original` | `revised` | `pending`); (3) UI — React 19 + Tailwind 4 + Recharts 3. Alterar qualquer premissa recalcula todos os resultados (receitas → EBITDA → fluxos → dívida → garantias → sócios → TIR/VPL → valuation) em uma única passagem.

Execução local: `npm install && npm run dev` (ou `npm run build` → `dist/`). Testes: `npx vitest run`. Publicação: `dist/` é estático (qualquer host); a versão hospedada no claude.ai usa a capacidade `downloads` do viewer para entregar arquivos.

## 2. Calendário e grão

Fluxo **mensal** de `calendar.modelStart` (jan/2024, para incluir o realizado) até `flowEnd` (dezembro do ano `inauguração + horizonte − 1`; Excel: dez/2050). `baseDate` (mar/2026) separa realizado de a realizar. Ano de operação `E` = 1 no mês da inauguração, +1 a cada 12 meses; as grades de premissas têm 6 anos (ano 7+ repete o 6º). Fase 02 tem calendário próprio (obra, inauguração) e pode seguir o tarifário da Fase 01 (`rateCalendar: 'phase1'`, como no Excel).

## 3. Módulos e fórmulas

**Capacidade e casamentos (buyout)** — por mês: casamentos = `countByYear[E] × monthWeights[m]/Σ`; diárias bloqueadas = `UH usadas × diárias × casamentos` (limitado a UH × dias). Receita = hospedagem do buyout (`bloqueadas × roomRate × (1+g)^(E−1)`) + locação + welcome party + catering (próprio: `convidados × preço × (1 + taxa de serviço)`; terceirizado: `× comissão`) + bebidas + pool party + outras + consumo extra (`convidados × diárias × ticket`). Componentes ligam/desligam por fase comercial (`phases.p1/p2/p3.startYear`). Custos = componente × `%` + impostos de A&B sobre os componentes de A&B. **Sem dupla contagem:** as diárias bloqueadas são retiradas da disponibilidade da hotelaria convencional antes de aplicar a ocupação; se configurado, restaurante e beach club fecham nos dias de buyout.

**Hotelaria** — por fase e mês: dias normais `daysNormal[E][m]`, especiais = dias do mês − normais (meses fixos 31/28/30, como o Excel). Disponíveis = dias × UH − bloqueio; ocupadas = disponíveis × ocupação da grade. Diária normal = `rateNormalYear1[m] × Π(1+g_anos 2..6) × (1+g_lt)^(max(0,E−6)) × índice da tipologia`; modo `excel` reproduz `(1+g)^(E−6)` para todo E (erro E7). Diária especial análoga. Hóspedes = ocupadas × (média da tipologia ou `guestsPerRoom[m]`). Receita intermediada = ocupadas normais × `shareOTA[m]` × diária; comissão = × `otaCommission`. Custo variável por diária ocupada.

**A&B** — restaurante = dias abertos (dias reais do mês, como o Excel) × lugares[m] × `seatShare` da fase × giro[m] × ticket (crescimento anos 2–6 e longo prazo); eventos legados do Excel; A&B hóspedes = ticket × diárias ocupadas ou hóspede-noite; beach club = dias abertos × visitantes/dia × ramp × ticket; experiências. Custos: impostos %, CMV %, CMO variável % + CMO fixo mensal (Excel R$180k; cenários revisados 0, substituído pela folha por cargo), outros.

**Folha** — por cargo: `headcount[E][m] × custo mensal (salário × 1,45)` por centro de custo (hotel / A&B / adm), extras por diária ocupada e por casamento, correção inflacionária (`compound`: `(1+i)^(E−1) − 1`; `excel`: `1 − (1+i)^−(E−1)`, erro E3), PLR % sobre resultado hoteleiro (Excel) ou GOP.

**Opex** — diretos (internet, utilities, manutenção, lavanderia × diárias), administrativos (itens fixos), marketing (% receita hoteleira + impressos), seguros + IPTU (março, inclusive pré-operação a partir do início da obra), todos com correção inflacionária; Fase 02 replica `phase2FixedCostFactor` dos fixos. Operador: próprio (custo corporativo mensal indexado) ou terceiro (fee base % receita + incentivo % GOP). Pré-abertura (total nos N meses antes da inauguração). Reserva de FF&E % receita a partir do ano N. Capital de giro: recebíveis/pagáveis em dias (Δ no fluxo, liberado no fim).

**Resultado** — Receita bruta → impostos sobre receita (ISS + PIS/COFINS sobre hospedagem conforme regime; A&B dentro dos custos de A&B) → GOP → EBITDA (após operador, pré-abertura, reserva) → depreciação (obra+projetos 25 anos, FF&E 10 anos, a partir da inauguração de cada fase) → EBIT.

**CAPEX** — modo `excel`: séries mensais do Excel por item (CR…DS) × escala × (1 + contingência), reancoradas ao novo início de obra se a data mudar (realizado permanece nas datas originais); modo `parametric`: itens com total, offset, duração e curva (linear/S). `includeSunk` controla os gastos já realizados.

**Tributos sobre o lucro** — `excelNOI`: 22,5% × NOI positivo; `presumido`: base presumida por fluxo (hotel 32%/32%, A&B 8%/12%) × (IRPJ 15% + adicional 10% acima de R$20k/mês + CSLL 9%); `real`: (EBIT − juros − tarifas) × (IRPJ + adicional + CSLL) com compensação de prejuízos limitada a 30%. Calculado desalavancado (projeto) e alavancado (equity).

**Dívida** — por empréstimo: desembolsos por tranches ou pró-rata ao CAPEX da fase × `financedPct` (BNB: 90%) a partir de `proCapexStart`; taxa mensal = `((1+spread)(1+inflação))^(1/12) − 1` (ou fixa) × (1 − bônus de adimplência); carência contada do 1º desembolso (juros pagos ou capitalizados); amortização SAC (saldo / meses restantes) ou Price; custo de estruturação, seguro sobre saldo, tarifas; amortizações extraordinárias; DSCR anual = (EBITDA − impostos) / serviço.

**Garantias** — exigência = `requiredPctOfLoan` (80%) × saldo do financiamento da Fase 01; déficit = exigência − imóvel (R$6,025M) − % da obra executada aceita; vinculado = min(comprometido, déficit), crescendo durante os desembolsos e, após N meses da inauguração, reduzindo com a amortização (`releaseWithAmortization`). Modelo A: fee mensal pago (`vinculado × fee/12`, indexado opcionalmente); B: fee acumulado a `deferredAccrualRate`, pago em 12 parcelas a partir de N meses após a inauguração, mais o fee corrente; C: sem fee, participação adicional `extraStakePct` na cap table. Custos de constituição e manutenção. O custo entra no fluxo do equity e o fee é receita do investidor.

**Fluxos** — FCF projeto = EBITDA − imposto desalavancado − CAPEX − ΔCG (+ valor terminal no fim); FCF equity = FCF projeto + benefício fiscal dos juros + saques − serviço da dívida − custos de garantias. Caixa: chamadas de capital quando o saldo fica negativo; distribuições = (caixa − reserva) × payout após N meses da inauguração e com DSCR acima do mínimo; liquidação no fim.

**Sócios** — cap table: investidor = participação negociada ou `aporte/(pré-money + aporte)` + participação por garantias (modelo C); atuais diluídos pró-rata. Aportes: investidor no closing; chamadas pré-closing e demais pelos atuais (pró-rata pré) ou por todos (pró-rata pós). Distribuições pró-rata pós (com preferência simples opcional). Saída no ano N: equity value por múltiplo de EBITDA LTM, DCF ou NOI × 12, menos dívida líquida; cada sócio recebe sua fração. TIR = XIRR dos fluxos datados; VPL a `discountRateEquity`; MOIC.

**Indicadores** — TIR do projeto (IRR mensal anualizada, equivalente à do Excel) e sem valor terminal; VPL (XNPV na data-base); TIR/VPL do equity; payback simples e descontado; exposição máxima; DSCR mínimo/médio; margem EBITDA; ROIC; yield on cost; ocupação, ADR, RevPAR, TRevPAR e receita por hóspede do ano estabilizado (6º ano completo); valuation DCF (perpetuidade `g`, múltiplo de EBITDA ou NOI × 12) e por múltiplo de EBITDA estabilizado; dívida líquida na data de avaliação.

**Análises** — tornado e heatmap recalculam o cenário com drivers (ocupação, ADR, casamentos, ticket de eventos, A&B, custos, CAPEX, juros, prazo, custo de garantias, participação, múltiplo, taxa de desconto); break-even de ocupação (VPL = 0 e DSCR = 1) e de casamentos; análise reversa: participação que iguala a TIR do investidor à meta (bisseção sobre `stakeNegotiated`); comparação dos modelos de garantia.

## 4. Proveniência e rastreabilidade

Cada premissa carrega origem (`excel` = planilha original, `doc` = documento de referência — BNB, propostas Saline, informações de Erich —, `hypothesis` = nova hipótese) e status (`original`, `revised`, `pending`). A UI mostra o ponto de origem ao lado de cada input (anel vermelho = pendente de validação) e a página Scenario Lab lista o registro completo. A função de auditoria (`TraceDrawer`, clique em qualquer indicador) percorre o grafo `trace.ts` e lista fórmulas e premissas que influenciam o indicador.

## 5. Premissas que exigem validação (status `pending`)
Tipologia das UH; quadro de pessoal; regime tributário e ISS de Acaraú; condições do BNB (taxa, indexador, bônus, carência, prazo, SAC/Price, cronograma, seguros, covenants, aceitação de gastos realizados); escopo do CAPEX do BNB (R$19,706M) × Excel (R$23,67M); pré-money; múltiplo de saída; volumes do beach club; data de início da Fase 02.

## 6. Limitações conhecidas
- Receita de restaurante e beach club é modelada por giro de lugares/visitantes, independente da ocupação do hotel (herança do Excel): a sensibilidade à ocupação subestima o risco combinado.
- VPL: XNPV com datas efetivas na data-base (fluxos anteriores capitalizados); o Excel desconta mês a mês e não desconta fluxos anteriores — diferença de ~0,5% no VPL, zero nas TIRs.
- Yield on cost do projeto (NOI estabilizado / CAPEX) resulta em 35–40% nos cenários revisados, 3–4× acima da referência de mercado para hotelaria — consequência do CAPEX do Excel (≈R$1,3M/UH) combinado às diárias de R$2,2–4,0k. É o principal ponto que um investidor questionará; a plataforma permite estressar CAPEX e ADR simultaneamente no heatmap.
- O desembolso do BNB pró-rata (90% do CAPEX após a data-base) resulta em ~R$18,7M, não R$20,7M, porque parte do CAPEX já foi gasta; se o BNB aceitar reembolsar gastos anteriores, use `proCapexStart` anterior ou tranches.
