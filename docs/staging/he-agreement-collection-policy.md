# Política de cobro y entrega a Opera por convenio — decisión 25/11/2026
Estado: especificación de staging, no aplicada. Condiciones declaradas por el titular; validar términos contractuales restantes antes de activar.

## Casos
- Fauna: venta/cobro al final del checkout del cliente. Puede operar sin pago anticipado si confirmación y datos operativos están completos; mostrar saldo y vencimiento. Falta confirmar quién recauda, quién liquida a Hotel Experience y plazo de liquidación.
- Paolo: exige pago del 100%. Para la regla de este canal, no entregar como listo hasta acreditar pago íntegro; no confundir vendedor con receptor de fondos. Confirmar prioridad si coincide con convenio hotelero.
- Casa Solcor: el hotel recibe el pago del pasajero. No inferir pago, porcentaje exigido antes del servicio, ni fecha de liquidación de Solcor a Hotel Experience. Estos términos quedan pendientes; no marcar como cobrado por Hotel Experience.
- Directo/otros: configurable, sin valor por defecto universal. Ausencia o conflicto de política => revisión comercial; nunca inventar porcentaje.

## Contrato de configuración y snapshot (propuesta)
Reutilizar hotel_partners, seller_partner_assignments, leads, lead_services, payment_movements y service_commissions. No duplicar registros comerciales. Revisar si existe otra estructura equivalente antes de crear tabla. Configuración administrada por admin/manager, asociada a convenio/origen y cuando corresponda canal/vendedor, vigencia y versión. Seleccionar política explícita cuando coinciden reglas; snapshot inmutable en la reserva confirmada para evitar alterar ventas anteriores por cambios futuros. Campos: identificador/versión, ámbito, receptor del pago cliente (Hotel Experience/hotel/tercero/pendiente), momento de cobro (antes de operar/checkout/otro), porcentaje mínimo de pago acreditado para operar (0–100 o pendiente), obligado a liquidar, fecha o regla de vencimiento de liquidación, tratamiento de comisión y evidencia exigida. Excepciones autorizadas con actor, motivo, fecha y alcance. No introducir valores no aprobados.

## Tres estados independientes
1. Comercial: solicitado, cotizado, confirmado, cancelado.
2. Financiero del pasajero: total acordado, monto pagado acreditado, porcentaje pagado, saldo, fecha prevista, receptor, estado pendiente/parcial/pagado/no verificado; sin mezclar monedas. Calcular con movimientos/evidencias, no con declaración sin validar. Si total no definido o evidencia externa insuficiente, porcentaje desconocido, no 0% inventado.
3. Liquidación a HE: monto a recibir según convenio, recibido por HE, saldo a liquidar, responsable, vencimiento, estado. Evitar doble conteo de un pago externo y transferencia posterior; verificar contabilidad y comisiones existentes antes de añadir movimientos.

Opera admite reserva confirmada con datos requeridos y regla aplicable satisfecha. Pagos pendientes permanecen visibles en ambas apps, incluso si Opera está autorizado. Saldo no impide operación cuando convenio lo permite. No convertir a pagado por autorización de operar. Recalcular ante pagos/reembolsos/cancelaciones; cambios de readiness auditados y sin retirar silenciosamente una operación ya iniciada. No duplicar lead/service ni handoff.

## Casos de prueba (no ejecutados)
Importes sintéticos 100.000 CLP: Fauna 0 acreditado -> autorizado si resto completo y convenio vigente; saldo 100.000, vencimiento checkout. Paolo 50.000 -> no listo; 100.000 acreditado -> listo una vez. Solcor 100.000 acreditado por hotel -> pasajero pagado; HE recibido 0 si no existe transferencia, saldo HE según convenio (no inferir 100.000). Solcor sin evidencia -> pago cliente no verificado, readiness según condición aprobada; si falta condición, revisión. Conflicto Paolo/Fauna -> revisión sin elegir arbitrariamente. Duplicado/reembolso/moneda distinta -> prueba de consistencia. Ninguna prueba utiliza reservas ni cobros reales.
