# Hotel Bons Ventos — plataforma de viabilidade, financiamento e estruturação societária

Vite + React 19 + TypeScript + Tailwind 4 + Recharts 3 + Zustand. Motor financeiro puro em `src/engine` (conciliado com o Excel BARR_EVB R05).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # gera dist/ (estático, publicável em qualquer host)
npx vitest run     # 39 testes (conciliação com o Excel, finanças, consistência, estresse)
```

Documentação: `DOCUMENTACAO.md` (motor, fórmulas, premissas, metodologia) · `RELATORIO-CONCILIACAO.md` (Excel × plataforma) · `BRIEF.md` (guia de UI).
Reextração do Excel: `python3 scripts/extract_excel.py <xlsx> src/data/excel-r05.json tests/fixtures/excel-r05-flows.json`.
