"""Extrai premissas e séries do modelo Excel R05 para JSON (proveniência: excel)."""
import openpyxl, json, warnings, sys, datetime
warnings.filterwarnings('ignore')
from openpyxl.utils import column_index_from_string as ci, get_column_letter as gl
src=sys.argv[1]; out_app=sys.argv[2]; out_test=sys.argv[3]
wb=openpyxl.load_workbook(src,data_only=True)
C=wb['CENARIO']
def v(cell): 
    x=C[cell].value
    return x.strftime('%Y-%m') if isinstance(x,datetime.datetime) else x
MONTH_COLS=['P','T','X','AB','AF','AK','AO','AS','AW','BA','BF','BJ']
def grid(r0,n): return [[C[f'{c}{r0+i}'].value or 0 for c in MONTH_COLS] for i in range(n)]
def row(r): return [C[f'{c}{r}'].value or 0 for c in MONTH_COLS]
def gcol(col,rows): return [C[f'{col}{r}'].value or 0 for r in rows]
phase=lambda p1,p2: {'phase1':p1,'phase2':p2}
data={
 'meta':{'file':'BARR_EVB - R00A11 - HOTELARIA FASEADO 18_17 - R05.xlsx','title':C['G5'].value,'baseDate':v('BQ2'),'extractedAt':datetime.date.today().isoformat()},
 'areas':phase({'land':C['P10'].value,'built':C['P11'].value,'private':C['P12'].value,'rooms':C['P13'].value,'seats':C['P14'].value},
               {'land':C['AK10'].value,'built':C['AK11'].value,'private':C['AK12'].value,'rooms':C['AK13'].value,'seats':C['AK14'].value}),
 'dates':phase({'opening':v('P23'),'flowEnd':v('P24'),'constructionStart':v('P25'),'constructionEnd':v('P26'),'constructionMonths':C['P27'].value},
               {'opening':v('AK23'),'flowEnd':v('AK24'),'constructionStart':v('AK25'),'constructionEnd':v('AK26'),'constructionMonths':C['AK27'].value}),
 'hotel':{
   'occupancyNormal':grid(31,6),'daysNormal':grid(38,6),
   'rateNormalYear1':row(45),'rateGrowth':gcol('J',range(46,51)),
   'shareOTA':row(51),
   'occupancySpecial':grid(55,6),'daysSpecial':grid(62,6),
   'rateSpecialYear1':row(69),'rateSpecialGrowth':gcol('J',range(70,75)),
   'guestsPerRoom':row(109),
 },
 'restaurant':{'seats':row(78),'turnover':row(79),'ticketYear1':row(81),'ticketGrowth':gcol('J',range(82,87)),
   'seatShare':phase(C['Z14'].value,C['AU14'].value)},
 'events':{'perMonth':row(89),'pax':row(90),'ticketYear1':row(92),'ticketGrowth':gcol('J',range(93,98))},
 'fnbGuests':{'ticketYear1':row(100),'ticketGrowth':gcol('J',range(101,106))},
 'payroll':{'positions':[{'name':C[f'B{r}'].value,'monthlyCost':C[f'P{r}'].value} for r in range(152,161)],
            'plr':C['P161'].value,'inflation':C['P162'].value,'chargesFactor':1.45},
 'fnbCosts':{'taxes':C['P168'].value,'cmv':C['P169'].value,'cmoVar':C['P170'].value,'cmoFixedMonthly':C['K170'].value},
 'opexDirect':{'otaCommission':C['P176'].value,'internet':C['P177'].value,'utilities':C['P178'].value,'maintenance':C['P179'].value,'laundryPerRoomNight':C['P180'].value,'inflation':C['P181'].value},
 'opexAdmin':{'items':[{'name':C[f'B{r}'].value,'monthly':C[f'P{r}'].value} for r in (187,188,189,190,191,193)],'inflation':C['P194'].value},
 'marketing':{'pctHotelRevenue':C['P200'].value,'printMonthly':C['P201'].value,'inflation':C['P202'].value},
 'insurance':{'monthly':C['P208'].value,'iptuAnnual':C['P209'].value,'inflation':C['P210'].value},
 'terminal':{'yearsAfterOpening':C['B215'].value,'noiMultiple':C['AF215'].value,'capRate':C['AT215'].value},
 'tax':{'rateOnNOI':C['P223'].value},
 'capexTotals':phase({'constructionRaw':C['U229'].value,'adminFeePct':C['P230'].value,'generalConditionsMonthly':C['P231'].value,'mobilization':C['P232'].value,'demobilization':C['P233'].value,'preConstructionWorks':C['P234'].value,'infrastructure':C['P235'].value,'managementMonthly':C['P236'].value,
   'ffePrivatePerRoom':C['P242'].value,'ffeCommonPerM2':C['P243'].value,'ffeGym':C['P244'].value,'ffeKitchens':C['P245'].value,'ffeAdminPct':C['P246'].value,
   'legalProject':C['P252'].value,'projectsConsulting':C['P253'].value,'legalExpenses':C['P254'].value,'adminOther':C['P255'].value,'accounting':C['P256'].value,'legal':C['P257'].value,
   'landAcquisition':C['P263'].value,'landMaintenance':C['P264'].value},
   {'constructionRaw':C['AP229'].value,'adminFeePct':C['AK230'].value,'generalConditionsMonthly':C['AK231'].value,'mobilization':C['AK232'].value,'demobilization':C['AK233'].value,'preConstructionWorks':C['AK234'].value,'infrastructure':C['AK235'].value,'managementMonthly':C['AK236'].value,
   'ffePrivatePerRoom':C['AK242'].value,'ffeCommonPerM2':C['AK243'].value,'ffeGym':C['AK244'].value,'ffeKitchens':C['AK245'].value,'ffeAdminPct':C['AK246'].value,
   'legalProject':C['AK252'].value,'projectsConsulting':C['AK253'].value,'legalExpenses':C['AK254'].value,'adminOther':C['AK255'].value,'accounting':C['AK256'].value,'legal':C['AK257'].value,
   'landAcquisition':C['AK263'].value,'landMaintenance':C['AK264'].value}),
 'financing':phase({'tranches':[{'date':v(f'P{r}'),'amount':C[f'Z{r}'].value or 0} for r in range(270,274)],'rate':C['P275'].value,'index':C['AC275'].value,'graceMonths':C['P276'].value,'amortMonths':C['Z276'].value,'structuringPct':C['P277'].value,'recurring':C['P278'].value},
                   {'tranches':[{'date':v(f'AK{r}'),'amount':C[f'AU{r}'].value or 0} for r in range(270,274)],'rate':C['AK275'].value,'index':C['AX275'].value,'graceMonths':C['AK276'].value,'amortMonths':C['AU276'].value,'structuringPct':C['AK277'].value,'recurring':C['AK278'].value}),
 'discountRate':C['K323'].value,
 'results':phase({'irrMonthly':C['P348'].value,'irrAnnual':C['Z348'].value,'npv':C['P323'].value,'payback':v('P349'),'maxExposure':C['Z350'].value,'maxExposureDate':v('P350'),'terminalValue':C['Z218'].value,'noi':C['P309'].value,'revenue':C['P301'].value,'taxes':C['P319'].value,'capex':C['P288'].value,'net':C['P322'].value},
                 {'irrMonthly':C['AK348'].value,'irrAnnual':C['AU348'].value,'npv':C['AK323'].value,'payback':v('AK349'),'maxExposure':C['AU350'].value,'maxExposureDate':v('AK350'),'terminalValue':C['AU218'].value}),
 'resultsConsolidated':{'irrMonthly':C['BF348'].value,'irrAnnual':C['BN348'].value,'npv':C['BF323'].value,'maxExposure':C['BN350'].value,'terminalValue':C['BN218'].value},
}
# Histograma
H=wb['HISTOGRAMA']
positions=[]
# blocks: name row, then 'Ano' row, then 6 rows; month cols K,O,S,W,AA,AE,AI,AM,AQ,AU,AY,BC
hm=['K','O','S','W','AA','AE','AI','AM','AQ','AU','AY','BC']
r=2
while r<=81:
    name=H[f'B{r}'].value
    if isinstance(name,str) and name not in ('Ano',) and H[f'B{r+1}'].value=='Ano':
        g=[[H[f'{c}{r+2+i}'].value or 0 for c in hm] for i in range(6)]
        positions.append({'name':name,'headcount':g}); r+=9
    else: r+=1
data['histogram']=positions
# Curvas
CU=wb['CURVAS']
data['curves']={'construction':{str(CU[f'{c}6'].value):[CU[f'{c}{r}'].value or 0 for r in range(7,62)] for c in 'BCDEFGHI'},
  'infrastructure':[CU[f'O{r}'].value or 0 for r in range(7,62)],'preConstruction':[CU[f'S{r}'].value or 0 for r in range(7,62)],
  'ffe':[CU[f'W{r}'].value or 0 for r in range(7,62)],'project':[CU[f'AA{r}'].value or 0 for r in range(7,62)]}
# IDX monthly indices
I=wb['IDX']
data['indices']={'dates':[I[f'C{r}'].value.strftime('%Y-%m') for r in range(5,483)],'status':[I[f'D{r}'].value for r in range(5,483)],
  'IPCA':[I[f'G{r}'].value or 0 for r in range(5,483)],'IGPM':[I[f'F{r}'].value or 0 for r in range(5,483)],'INCC':[I[f'H{r}'].value or 0 for r in range(5,483)],'CDI':[I[f'I{r}'].value or 0 for r in range(5,483)]}
# Monthly flows
flows={}
for sh,key in [('FLUXO EV FASE 01','phase1'),('FLUXO EV FASE 02','phase2'),('FLUXO EV CONSOLIDADO','consolidated')]:
    ws=wb[sh]
    dates=[ws.cell(r,4).value.strftime('%Y-%m') for r in range(13,413)]
    cols={}
    for c in range(5,181):
        lab=ws.cell(5,c).value
        if not lab: continue
        vals=[ws.cell(r,c).value for r in range(13,413)]
        vals=[round(x,4) if isinstance(x,(int,float)) else 0 for x in vals]
        cols[gl(c)]={'label':lab.strip(),'values':vals}
    flows[key]={'dates':dates,'columns':cols,'yearIndex':[ws.cell(r,5).value or 0 for r in range(13,413)]}
# app file: capex & realized series only (phase1/phase2), relative to construction start
capex_cols=['CR','CS','CT','CU','CV','CW','CX','DA','DB','DC','DD','DE','DH','DI','DJ','DK','DL','DM','DP','DQ','DR','DX','BX','BY']
app={'meta':data['meta'],'series':{}}
for key in ['phase1','phase2']:
    f=flows[key]; app['series'][key]={'dates':f['dates'],'columns':{c:f['columns'][c] for c in capex_cols if c in f['columns']}}
data_app=dict(data); data_app['flowSeries']=app['series']
json.dump(data_app,open(out_app,'w'),ensure_ascii=False)
json.dump({'flows':flows},open(out_test,'w'))
print('positions',[p['name'] for p in positions]); print('ok', len(json.dumps(data_app))//1024,'KB app;', len(json.dumps(flows))//1024,'KB test')
