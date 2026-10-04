export const FOOD_TYPES=['Desayuno','Aperitivo','Almuerzo','Snack','Box lunch','Agua individual'] as const;
export type FoodType=typeof FOOD_TYPES[number];

export const DEFAULT_CONSUMPTION_TYPES=[
  {key:'standard',label:'Estándar'},
  {key:'vegetarian',label:'Vegetariano'},
  {key:'vegan',label:'Vegano'},
  {key:'gluten_free',label:'Sin gluten'},
  {key:'lactose_free',label:'Sin lactosa'},
  {key:'child',label:'Infantil'},
  {key:'special',label:'Especial'},
  {key:'none',label:'No consume'},
] as const;

export type FoodConsumptionKey=typeof DEFAULT_CONSUMPTION_TYPES[number]['key'];

export function foodOrder(value:string){
  const index=(FOOD_TYPES as readonly string[]).indexOf(value);
  return index<0?FOOD_TYPES.length:index;
}

export function consumptionLabel(value:string|null|undefined,types:{key:string;label:string}[]=DEFAULT_CONSUMPTION_TYPES as any){
  if(!value)return 'Sin definir';
  return types.find(item=>item.key===value)?.label||value;
}

export function moneyCLP(value:number|string|null|undefined){
  return new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(value||0));
}
