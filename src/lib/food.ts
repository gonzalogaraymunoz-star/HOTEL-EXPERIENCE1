export const FOOD_TYPES=['Desayuno','Aperitivo','Almuerzo','Snack','Box lunch','Agua individual'] as const;
export type FoodType=typeof FOOD_TYPES[number];

export function foodOrder(value:string){
  const index=(FOOD_TYPES as readonly string[]).indexOf(value);
  return index<0?FOOD_TYPES.length:index;
}

export function moneyCLP(value:number|string|null|undefined){
  return new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(value||0));
}
