import { useState, useMemo, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ComposedChart, Cell
} from "recharts";

function getWeeklyData(acts) {
  const weeks = {};
  acts.forEach(a => {
    const d = new Date(a.date);
    const ws = new Date(d); ws.setDate(d.getDate() - ((d.getDay()+6)%7));
    const key = ws.toISOString().slice(0,10);
    if (!weeks[key]) weeks[key] = {week:key, km:0, count:0, hrs:[], paces:[]};
    weeks[key].km += a.distance_km;
    weeks[key].count++;
    if (a.avg_hr) weeks[key].hrs.push(a.avg_hr);
    if (a.avg_pace_min_km) weeks[key].paces.push(a.avg_pace_min_km);
  });
  return Object.values(weeks).sort((a,b)=>a.week.localeCompare(b.week)).map(w => ({
    ...w, km: Math.round(w.km*10)/10,
    avgHR: w.hrs.length ? Math.round(w.hrs.reduce((s,h)=>s+h,0)/w.hrs.length) : null,
    avgPace: w.paces.length ? Math.round(w.paces.reduce((s,p)=>s+p,0)/w.paces.length*100)/100 : null,
  }));
}

function getMonthlyData(acts) {
  const months = {};
  acts.forEach(a => {
    const key = a.date.slice(0,7);
    if (!months[key]) months[key] = {month:key, km:0, count:0};
    months[key].km += a.distance_km; months[key].count++;
  });
  return Object.values(months).sort((a,b)=>a.month.localeCompare(b.month)).map(m=>({...m, km:Math.round(m.km)}));
}

const KPI = ({label, value, sub}) => (
  <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
    <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
    <div className="text-2xl font-bold mt-1">{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
  </div>
);

const CustomTooltip = ({active, payload, label}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs">
      <p className="text-gray-300 font-medium mb-1">{label}</p>
      {payload.map((p,i) => <p key={i} style={{color:p.color}}>{p.name}: {p.value}</p>)}
    </div>
  );
};

export default function GarminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("volume");

  useEffect(() => {
    fetch('/data/garmin_data.json')
      .then(r => {
        if (!r.ok) throw new Error('Failed to load data');
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const acts = data?.activities || [];
  const weekly = useMemo(() => getWeeklyData(acts), [acts]);
  const monthly = useMemo(() => getMonthlyData(acts), [acts]);

  const totalKm = Math.round(acts.reduce((s,a)=>s+a.distance_km,0));
  const avgWeekly = weekly.length ? Math.round(weekly.reduce((s,w)=>s+w.km,0)/weekly.length*10)/10 : 0;
  const pacedActs = acts.filter(a=>a.avg_pace_min_km);
  const avgPace = pacedActs.length ? pacedActs.reduce((s,a)=>s+a.avg_pace_min_km,0)/pacedActs.length : 0;
  const hrActs = acts.filter(a=>a.avg_hr);
  const avgHR = hrActs.length ? Math.round(hrActs.reduce((s,a)=>s+a.avg_hr,0)/hrActs.length) : 0;
  const longest = acts.length ? Math.max(...acts.map(a=>a.distance_km)) : 0;
  const fmtPace = (v) => { const m=Math.floor(v); const s=Math.round((v-m)*60); return `${m}:${s<10?'0':''}${s}`; };

  const dailyData = acts.map(a => ({date: a.date.slice(5,10), km: a.distance_km, pace: a.avg_pace_formatted, hr: a.avg_hr}));

  const paceHRData = acts.filter(a=>a.avg_pace_min_km&&a.avg_hr).map(a => ({
    date: a.date.slice(5,10), pace: a.avg_pace_min_km, hr: a.avg_hr
  }));

  const scatterData = acts.filter(a=>a.avg_pace_min_km&&a.avg_hr).map((a,i,arr) => ({
    pace: a.avg_pace_min_km, hr: a.avg_hr, date: a.date.slice(0,10),
    fill: `hsl(${260 - (i/arr.length)*120}, 70%, 60%)`
  }));

  const targetActs = acts.filter(a => a.avg_pace_min_km >= 5.5 && a.avg_pace_min_km <= 6.5 && a.avg_hr);
  const effData = targetActs.map((a,i) => {
    const window = targetActs.slice(Math.max(0,i-4), i+1);
    return { date: a.date.slice(5,10), hr: a.avg_hr, ma: Math.round(window.reduce((s,x)=>s+x.avg_hr,0)/window.length) };
  });

  const driftData = weekly.filter(w=>w.avgHR&&w.avgPace).map(w => ({
    week: w.week.slice(5), ratio: Math.round(w.avgHR/w.avgPace*100)/100
  }));

  let cum = 0;
  const cumData = acts.map(a => { cum += a.distance_km; return {date: a.date.slice(5,10), km: Math.round(cum)}; });

  const tabs = [
    {id:"volume", label:"Объёмы"},
    {id:"dynamics", label:"Темп и Пульс"},
    {id:"activities", label:"Тренировки"},
    {id:"efficiency", label:"Эффективность"}
  ];

  const mid = Math.floor(paceHRData.length/2);
  const firstHalf = paceHRData.slice(0,mid);
  const secondHalf = paceHRData.slice(mid);
  const r1 = firstHalf.length ? firstHalf.reduce((s,a)=>s+a.hr/a.pace,0)/firstHalf.length : 0;
  const r2 = secondHalf.length ? secondHalf.reduce((s,a)=>s+a.hr/a.pace,0)/secondHalf.length : 0;
  const change = r1 ? ((r2-r1)/r1*100).toFixed(1) : "0";

  if (loading) return (
    <div className="bg-gray-950 text-gray-100 min-h-screen flex items-center justify-center">
      <div className="text-lg text-gray-400">Загрузка данных...</div>
    </div>
  );

  if (error) return (
    <div className="bg-gray-950 text-gray-100 min-h-screen flex items-center justify-center">
      <div className="text-lg text-red-400">Ошибка: {error}</div>
    </div>
  );

  return (
    <div className="bg-gray-950 text-gray-100 min-h-screen">
      <div className="bg-gradient-to-r from-gray-900 to-purple-950 p-6 border-b border-gray-800">
        <h1 className="text-2xl font-bold">Marathon Training Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">{acts.length} тренировок | {totalKm} км | {data?.meta?.date_range}</p>
      </div>

      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPI label="Тренировок" value={acts.length} sub={data?.meta?.date_range} />
          <KPI label="Общая дистанция" value={`${totalKm} км`} />
          <KPI label="Сред. км/нед" value={avgWeekly} />
          <KPI label="Средний темп" value={fmtPace(avgPace)} sub="мин/км" />
          <KPI label="Средний пульс" value={avgHR} sub="уд/мин" />
          <KPI label="Макс. дистанция" value={`${longest} км`} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1 border border-gray-700 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${tab===t.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Volume Tab */}
        {tab === "volume" && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold mb-3">Дневной объём (км)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{fontSize:10, fill:'#9ca3af'}} interval="preserveStartEnd" />
                  <YAxis tick={{fontSize:10, fill:'#9ca3af'}} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="km" radius={[3,3,0,0]}>
                    {dailyData.map((d,i) => <Cell key={i} fill={d.km>15?'#6366f1':d.km>10?'#4dabf7':'#00d4aa'} fillOpacity={0.8} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-semibold mb-3">Недельный объём (км)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weekly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="week" tick={{fontSize:9, fill:'#9ca3af'}} tickFormatter={v=>v.slice(5)} />
                    <YAxis tick={{fontSize:10, fill:'#9ca3af'}} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="km" fill="#6366f1" radius={[4,4,0,0]} fillOpacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-semibold mb-3">Месячный объём (км)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="month" tick={{fontSize:10, fill:'#9ca3af'}} />
                    <YAxis tick={{fontSize:10, fill:'#9ca3af'}} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="km" fill="#00d4aa" radius={[4,4,0,0]} fillOpacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold mb-3">Кумулятивная дистанция (км)</h3>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={cumData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{fontSize:10, fill:'#9ca3af'}} interval="preserveStartEnd" />
                  <YAxis tick={{fontSize:10, fill:'#9ca3af'}} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="km" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Dynamics Tab */}
        {tab === "dynamics" && (
          <div className="space-y-4">
            <div className={`rounded-xl p-4 border ${change < -2 ? 'bg-green-950 border-green-800' : change < 2 ? 'bg-gray-800 border-gray-700' : 'bg-red-950 border-red-800'}`}>
              <h4 className="text-sm font-semibold text-emerald-400 mb-1">Анализ эффективности</h4>
              <p className="text-xs text-gray-300">
                {change < -2
                  ? `Отличная динамика! Соотношение пульс/темп снизилось на ${Math.abs(change)}% — аэробная база растёт.`
                  : change < 2
                  ? `Соотношение пульс/темп стабильно (${change}%). Форма на хорошем уровне.`
                  : `Внимание: соотношение пульс/темп выросло на ${change}%. Добавьте восстановительных тренировок.`
                }
              </p>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold mb-3">Динамика темпа и пульса</h3>
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={paceHRData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{fontSize:9, fill:'#9ca3af'}} interval="preserveStartEnd" />
                  <YAxis yAxisId="pace" orientation="left" reversed tick={{fontSize:10, fill:'#00d4aa'}} domain={['auto','auto']} label={{value:'Темп', angle:-90, position:'insideLeft', fill:'#00d4aa', fontSize:11}} />
                  <YAxis yAxisId="hr" orientation="right" tick={{fontSize:10, fill:'#f87171'}} domain={['auto','auto']} label={{value:'Пульс', angle:90, position:'insideRight', fill:'#f87171', fontSize:11}} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line yAxisId="pace" type="monotone" dataKey="pace" stroke="#00d4aa" dot={{r:2}} name="Темп (мин/км)" strokeWidth={2} />
                  <Line yAxisId="hr" type="monotone" dataKey="hr" stroke="#f87171" dot={{r:2}} name="Пульс (уд/мин)" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-semibold mb-1">Пульс vs Темп (scatter)</h3>
                <p className="text-xs text-gray-500 mb-3">Цвет: фиолетовый = старые, бирюзовый = новые</p>
                <ResponsiveContainer width="100%" height={250}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="pace" name="Темп" tick={{fontSize:10, fill:'#9ca3af'}} label={{value:'Темп мин/км', position:'bottom', fill:'#9ca3af', fontSize:10}} />
                    <YAxis dataKey="hr" name="Пульс" tick={{fontSize:10, fill:'#9ca3af'}} label={{value:'Пульс', angle:-90, position:'insideLeft', fill:'#9ca3af', fontSize:10}} />
                    <Tooltip cursor={{strokeDasharray:'3 3'}} formatter={(v,n)=>[v, n==='pace'?'Темп':'Пульс']} />
                    <Scatter data={scatterData} shape="circle">
                      {scatterData.map((d,i) => <Cell key={i} fill={d.fill} />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-semibold mb-1">Cardiac Drift (HR/Pace) по неделям</h3>
                <p className="text-xs text-gray-500 mb-3">Снижение = рост аэробной базы</p>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={driftData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="week" tick={{fontSize:10, fill:'#9ca3af'}} />
                    <YAxis tick={{fontSize:10, fill:'#9ca3af'}} domain={['auto','auto']} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="ratio" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.15} name="HR/Pace" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Activities Tab */}
        {tab === "activities" && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {["Дата","Дистанция","Время","Темп","Пульс","Набор"].map(h => (
                      <th key={h} className="text-left p-3 text-gray-400 font-semibold uppercase tracking-wide bg-gray-900 sticky top-0">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...acts].reverse().map(a => (
                    <tr key={a.id} className="border-t border-gray-700 hover:bg-gray-750">
                      <td className="p-3 whitespace-nowrap">{a.date.slice(0,10)}</td>
                      <td className="p-3 whitespace-nowrap text-sky-400 font-semibold">{a.distance_km} км</td>
                      <td className="p-3 whitespace-nowrap">{a.duration_formatted}</td>
                      <td className="p-3 whitespace-nowrap text-emerald-400 font-semibold">{a.avg_pace_formatted}</td>
                      <td className="p-3 whitespace-nowrap text-red-400 font-semibold">{a.avg_hr || '—'}</td>
                      <td className="p-3 whitespace-nowrap">{a.elevation_gain}м</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Efficiency Tab */}
        {tab === "efficiency" && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold mb-1">Пульс при целевом темпе (5:30 - 6:30 мин/км)</h3>
              <p className="text-xs text-gray-500 mb-3">Тренд вниз = улучшение аэробной формы</p>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={effData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{fontSize:10, fill:'#9ca3af'}} interval="preserveStartEnd" />
                  <YAxis tick={{fontSize:10, fill:'#9ca3af'}} domain={['auto','auto']} />
                  <Tooltip content={<CustomTooltip />} />
                  <Scatter dataKey="hr" fill="#f87171" fillOpacity={0.5} name="Пульс" />
                  <Line type="monotone" dataKey="ma" stroke="#fbbf24" strokeWidth={3} dot={false} name="Скользящее среднее" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold mb-3">Средний пульс и темп по неделям</h3>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={weekly.filter(w=>w.avgHR)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="week" tick={{fontSize:9, fill:'#9ca3af'}} tickFormatter={v=>v.slice(5)} />
                  <YAxis yAxisId="hr" tick={{fontSize:10, fill:'#f87171'}} domain={['auto','auto']} />
                  <YAxis yAxisId="pace" orientation="right" reversed tick={{fontSize:10, fill:'#00d4aa'}} domain={['auto','auto']} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar yAxisId="hr" dataKey="avgHR" fill="#f87171" fillOpacity={0.6} name="Ср. пульс" radius={[3,3,0,0]} />
                  <Line yAxisId="pace" type="monotone" dataKey="avgPace" stroke="#00d4aa" strokeWidth={2} name="Ср. темп" dot={{r:3}} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
