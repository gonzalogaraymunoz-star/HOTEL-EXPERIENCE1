import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const required=[
  'package.json','vercel.json','vite.config.ts','index.html',
  'src/App.tsx','src/main.tsx','src/styles.css','src/types.ts',
  'src/components/LoginScreen.tsx','src/components/CRMApp.tsx','src/components/LeadDrawer.tsx',
  'src/components/OperationsHub.tsx','src/components/ReservationOperations.tsx',
  'src/components/ServiceOperationModal.tsx','src/components/ProductCatalogView.tsx',
  'src/components/AiAssistant.tsx','src/components/PublicRegistration.tsx','src/components/TeamView.tsx',
  'src/lib/api.ts','src/lib/supabase.ts','src/lib/tvPricing.ts',
  'src/data/tv1_2_crm_cotizador_tours.json',
  'supabase/migrations/20260820_hotel_experience_v6.sql'
];
const missing=required.filter(f=>!fs.existsSync(path.join(root,f)));
if(missing.length){console.error('Faltan archivos:',missing);process.exit(1)}
const data=JSON.parse(fs.readFileSync(path.join(root,'src/data/tv1_2_crm_cotizador_tours.json'),'utf8'));
const tours=data?.web_view?.tours||[];
if(tours.length!==33){console.error('TV1.2 inválido: se esperaban 33 tours y llegaron',tours.length);process.exit(1)}
for(const m of ['low','semiprivado','privado']) if(!data?.pricing_logic?.modalities?.[m]){console.error('Falta modalidad',m);process.exit(1)}
const crm=fs.readFileSync(path.join(root,'src/components/CRMApp.tsx'),'utf8');
for(const label of ['Productos','Operaciones','Proveedores','Prestadores','Vehículos','Insumos','Equipo']) if(!crm.includes(`label="${label}"`)){console.error('Falta menú',label);process.exit(1)}
console.log(`OK · Hotel Experience V6 · ${required.length} archivos críticos · ${tours.length} tours TV1.2`);
