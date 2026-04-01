import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MissionMetrics } from './MissionLogic';
import { Zap, Target, ShieldAlert, Scale, MapPin, Activity } from 'lucide-react';

interface EfficiencyUIProps {
  metrics: MissionMetrics;
  historyData: { time: number; sec: number; spt: number }[]; // Data for the chart
}

export const EfficiencyUI = ({ metrics, historyData }: EfficiencyUIProps) => {
  return (
    <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-xl p-4 shadow-2xl flex flex-col gap-4">
      <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
        <Zap className="w-4 h-4" /> Live Efficiency Engine
      </h3>
      
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard
          label="Specific Energy (SEC)"
          value={metrics.sec.toFixed(2)}
          unit="J/g·km"
          icon={<Zap className="w-3 h-3 text-amber-400" />}
          tooltip="Energy consumed per gram of drone per kilometer flown. Lower = more efficient. Typical range: 5-15 J/g·km."
        />
        <MetricCard
          label="Stability-Power (SPT)"
          value={metrics.spt.toFixed(3)}
          unit="Ratio"
          icon={<Activity className="w-3 h-3 text-blue-400" />}
          tooltip="Ratio of attitude stability to power consumption. Higher = better stability per watt. Values near 1.0 indicate efficient hover."
        />
        <MetricCard 
          label="Optimal Cargo" 
          value={metrics.optimalCargoWeight.toFixed(1)} 
          unit="kg" 
          icon={<Scale className="w-3 h-3 text-emerald-400" />} 
        />
        <MetricCard 
          label="Point of No Return" 
          value={metrics.pointOfNoReturn.toFixed(2)} 
          unit="km" 
          icon={<MapPin className="w-3 h-3 text-red-400" />} 
        />
        <MetricCard 
          label="Target Deviation" 
          value={metrics.targetDeviation.toFixed(1)} 
          unit="cm" 
          icon={<Target className="w-3 h-3 text-purple-400" />} 
        />
        <MetricCard 
          label="Structural Stress" 
          value={metrics.structuralStress.toFixed(2)} 
          unit="MPa" 
          icon={<ShieldAlert className="w-3 h-3 text-orange-400" />} 
        />
      </div>

      <div className="h-32 w-full mt-2">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <LineChart data={historyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="time" hide />
            <YAxis yAxisId="left" stroke="#237227" fontSize={10} tickFormatter={(v) => v.toFixed(1)} />
            <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" fontSize={10} tickFormatter={(v) => v.toFixed(1)} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', fontSize: '12px' }}
              itemStyle={{ color: '#e4e4e7' }}
            />
            <Line yAxisId="left" type="monotone" dataKey="sec" stroke="#237227" strokeWidth={2} dot={false} name="SEC" />
            <Line yAxisId="right" type="monotone" dataKey="spt" stroke="#f59e0b" strokeWidth={2} dot={false} name="SPT" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const MetricCard = ({ label, value, unit, icon, tooltip }: { label: string, value: string | number, unit: string, icon: React.ReactNode, tooltip?: string }) => (
  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 flex flex-col justify-between" title={tooltip}>
    <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
      {icon}
      <span className="text-[10px] uppercase font-bold tracking-wider">{label}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-lg font-mono text-zinc-100">{value}</span>
      <span className="text-xs text-zinc-500">{unit}</span>
    </div>
  </div>
);
