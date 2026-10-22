export type DataRow = Record<string, string | number>;
export type { AnalyticsData } from '@/lib/analytics';
export const money=(v:unknown)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2}).format(Number(v)||0);
export const number=(v:unknown)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:4}).format(Number(v)||0);
export const date=(v:unknown)=>String(v||'').slice(0,10).split('-').reverse().join('/');
