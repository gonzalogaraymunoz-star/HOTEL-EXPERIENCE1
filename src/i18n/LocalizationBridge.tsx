import {useEffect} from 'react';
import type {AppLanguage} from './LanguageProvider';
import {useLanguage} from './LanguageProvider';

type Translation={en:string;'pt-BR':string};

const D:Record<string,Translation>={
  // Global / navigation
  'Inicio':{en:'Home','pt-BR':'Início'},
  'Asistente comercial':{en:'Commercial assistant','pt-BR':'Assistente comercial'},
  'APOYO':{en:'ASSIST','pt-BR':'APOIO'},
  'Clientes':{en:'Clients','pt-BR':'Clientes'},
  'Pipeline':{en:'Pipeline','pt-BR':'Pipeline'},
  'Reservas':{en:'Bookings','pt-BR':'Reservas'},
  'Calendario':{en:'Calendar','pt-BR':'Calendário'},
  'Tareas':{en:'Tasks','pt-BR':'Tarefas'},
  'Pagos':{en:'Payments','pt-BR':'Pagamentos'},
  'Reportes':{en:'Reports','pt-BR':'Relatórios'},
  'Productos':{en:'Products','pt-BR':'Produtos'},
  'POSTVENTA':{en:'AFTER-SALES','pt-BR':'PÓS-VENDA'},
  'Review':{en:'Review','pt-BR':'Avaliações'},
  'OPERACIÓN':{en:'OPERATIONS','pt-BR':'OPERAÇÃO'},
  'Fichas':{en:'Records','pt-BR':'Cadastros'},
  'Operaciones':{en:'Operations','pt-BR':'Operações'},
  'Proveedores':{en:'Suppliers','pt-BR':'Fornecedores'},
  'Prestadores':{en:'Service providers','pt-BR':'Prestadores'},
  'Vehículos':{en:'Vehicles','pt-BR':'Veículos'},
  'Insumos':{en:'Resources','pt-BR':'Insumos'},
  'Equipo':{en:'Team','pt-BR':'Equipe'},
  'SISTEMA':{en:'SYSTEM','pt-BR':'SISTEMA'},
  'Complementos':{en:'Add-ons','pt-BR':'Complementos'},
  'Formulario público':{en:'Public form','pt-BR':'Formulário público'},
  'Buscar cliente, código, hotel...':{en:'Search client, code, hotel...','pt-BR':'Buscar cliente, código, hotel...'},
  'Buscar cliente, código, hotel, servicio, proveedor, vehículo...':{en:'Search client, code, hotel, service, supplier, vehicle...','pt-BR':'Buscar cliente, código, hotel, serviço, fornecedor, veículo...'},
  'Actualizar datos':{en:'Refresh data','pt-BR':'Atualizar dados'},
  'Cerrar sesión':{en:'Sign out','pt-BR':'Sair'},
  'Usuario':{en:'User','pt-BR':'Usuário'},
  'Cargando CRM...':{en:'Loading CRM...','pt-BR':'Carregando CRM...'},
  'Cargando Hotel Experience…':{en:'Loading Hotel Experience…','pt-BR':'Carregando Hotel Experience…'},
  'Preparando tu CRM…':{en:'Preparing your CRM…','pt-BR':'Preparando seu CRM…'},
  'Cuenta desactivada':{en:'Account disabled','pt-BR':'Conta desativada'},
  'Solicita acceso a un administrador.':{en:'Ask an administrator for access.','pt-BR':'Solicite acesso a um administrador.'},

  // CRM titles
  'Pipeline comercial':{en:'Sales pipeline','pt-BR':'Pipeline comercial'},
  'Calendario operacional':{en:'Operations calendar','pt-BR':'Calendário operacional'},
  'Tareas y seguimiento':{en:'Tasks and follow-up','pt-BR':'Tarefas e acompanhamento'},
  'Productos y valores':{en:'Products and prices','pt-BR':'Produtos e valores'},
  'Control de operación':{en:'Operations control','pt-BR':'Controle operacional'},
  'Fichas operacionales':{en:'Operations records','pt-BR':'Cadastros operacionais'},
  'Asistente comercial':{en:'Commercial assistant','pt-BR':'Assistente comercial'},

  // Lead / sales common
  'Oportunidades':{en:'Opportunities','pt-BR':'Oportunidades'},
  'Histórico':{en:'History','pt-BR':'Histórico'},
  'Histórico comercial':{en:'Sales history','pt-BR':'Histórico comercial'},
  'Todos':{en:'All','pt-BR':'Todos'},
  'Mis leads':{en:'My leads','pt-BR':'Meus leads'},
  'Sin asignar':{en:'Unassigned','pt-BR':'Não atribuído'},
  'Enfoque ventas':{en:'Sales focus','pt-BR':'Foco em vendas'},
  'Mostrar todos':{en:'Show all','pt-BR':'Mostrar todos'},
  'Nuevo lead':{en:'New lead','pt-BR':'Novo lead'},
  'Cliente':{en:'Client','pt-BR':'Cliente'},
  'Foco':{en:'Focus','pt-BR':'Foco'},
  'Responsable':{en:'Owner','pt-BR':'Responsável'},
  'Hotel':{en:'Hotel','pt-BR':'Hotel'},
  'Experiencias':{en:'Experiences','pt-BR':'Experiências'},
  'Venta':{en:'Sale','pt-BR':'Venda'},
  'Pago':{en:'Payment','pt-BR':'Pagamento'},
  'Etapa':{en:'Stage','pt-BR':'Etapa'},
  'Archivo':{en:'Archive','pt-BR':'Arquivo'},
  'Pagado':{en:'Paid','pt-BR':'Pago'},
  'Pendiente':{en:'Pending','pt-BR':'Pendente'},
  'Parcial':{en:'Partial','pt-BR':'Parcial'},
  'Reembolsado':{en:'Refunded','pt-BR':'Reembolsado'},
  'Nuevo':{en:'New','pt-BR':'Novo'},
  'Contactado':{en:'Contacted','pt-BR':'Contatado'},
  'Cotizado':{en:'Quoted','pt-BR':'Cotado'},
  'Confirmado':{en:'Confirmed','pt-BR':'Confirmado'},
  'Perdido':{en:'Lost','pt-BR':'Perdido'},
  'Alta':{en:'High','pt-BR':'Alta'},
  'Media':{en:'Medium','pt-BR':'Média'},
  'Baja':{en:'Low','pt-BR':'Baixa'},
  'Sin hotel':{en:'No hotel','pt-BR':'Sem hotel'},
  'Sin venta cargada':{en:'No sale amount entered','pt-BR':'Sem valor de venda informado'},
  'Sin fecha':{en:'No date','pt-BR':'Sem data'},
  'Sin identificar':{en:'Not identified','pt-BR':'Não identificado'},
  'Sin configurar':{en:'Not configured','pt-BR':'Não configurado'},
  'Sin regla':{en:'No rule','pt-BR':'Sem regra'},
  'Sin datos':{en:'No data','pt-BR':'Sem dados'},
  'Oportunidad marcada perdida':{en:'Opportunity marked as lost','pt-BR':'Oportunidade marcada como perdida'},
  'Más de 30 días sin actividad comercial vigente':{en:'More than 30 days without current sales activity','pt-BR':'Mais de 30 dias sem atividade comercial vigente'},
  'Negocio comercial vigente con foco en lo que todavía se puede accionar.':{en:'Current business focused on what can still be acted on.','pt-BR':'Negócio comercial vigente com foco no que ainda pode ser trabalhado.'},
  'Todas las oportunidades comerciales vigentes.':{en:'All current sales opportunities.','pt-BR':'Todas as oportunidades comerciais vigentes.'},
  'Viajes vencidos, oportunidades perdidas o leads sin actividad útil. Se conservan para consulta y reportes.':{en:'Past trips, lost opportunities or inactive leads. Kept for reference and reporting.','pt-BR':'Viagens passadas, oportunidades perdidas ou leads sem atividade útil. Mantidos para consulta e relatórios.'},

  // Dashboard / focus
  'CENTRO DEL DÍA':{en:'DAILY CENTER','pt-BR':'CENTRO DO DIA'},
  'Analizar con IA':{en:'Analyze with AI','pt-BR':'Analisar com IA'},
  'POR COBRAR':{en:'TO COLLECT','pt-BR':'A RECEBER'},
  'POR PAGAR PROVEEDORES':{en:'SUPPLIERS TO PAY','pt-BR':'A PAGAR FORNECEDORES'},
  'SALIDAS ≤48 H':{en:'DEPARTURES ≤48 H','pt-BR':'SAÍDAS ≤48 H'},
  'RESERVAS PRÓXIMAS LISTAS':{en:'UPCOMING BOOKINGS READY','pt-BR':'PRÓXIMAS RESERVAS PRONTAS'},
  'PRIORIDAD PRINCIPAL':{en:'TOP PRIORITY','pt-BR':'PRIORIDADE PRINCIPAL'},
  'Comercial':{en:'Sales','pt-BR':'Comercial'},
  'Finanzas':{en:'Finance','pt-BR':'Finanças'},
  'Operación':{en:'Operations','pt-BR':'Operação'},
  'VER PAGOS':{en:'VIEW PAYMENTS','pt-BR':'VER PAGAMENTOS'},
  'REVISAR':{en:'REVIEW','pt-BR':'REVISAR'},
  'SEGUIMIENTO':{en:'FOLLOW-UP','pt-BR':'ACOMPANHAMENTO'},
  'PROVEEDOR':{en:'SUPPLIER','pt-BR':'FORNECEDOR'},
  'LISTA PARA OPERAR':{en:'READY TO OPERATE','pt-BR':'PRONTO PARA OPERAR'},
  'Foco comercial':{en:'Sales focus','pt-BR':'Foco comercial'},
  'Leads con mayor señal de venta ahora':{en:'Leads with the strongest sales signal now','pt-BR':'Leads com maior sinal de venda agora'},
  'Próximas experiencias':{en:'Upcoming experiences','pt-BR':'Próximas experiências'},
  'Operación por fecha':{en:'Operations by date','pt-BR':'Operação por data'},
  'No hay leads con foco comercial.':{en:'No leads with sales focus.','pt-BR':'Não há leads com foco comercial.'},
  'No hay servicios próximos.':{en:'No upcoming services.','pt-BR':'Não há serviços próximos.'},
  'ENFOQUE COMERCIAL':{en:'SALES FOCUS','pt-BR':'FOCO COMERCIAL'},
  'Los mismos leads, vistos como negocio':{en:'The same leads, viewed as business','pt-BR':'Os mesmos leads, vistos como negócio'},
  'Embudo':{en:'Funnel','pt-BR':'Funil'},
  'Valor':{en:'Value','pt-BR':'Valor'},
  'Top oportunidades':{en:'Top opportunities','pt-BR':'Principais oportunidades'},
  'Leads con foco':{en:'Focused leads','pt-BR':'Leads em foco'},
  'Valor con foco':{en:'Focused value','pt-BR':'Valor em foco'},
  'Alta señal':{en:'High signal','pt-BR':'Sinal alto'},

  // Reservations / operations
  'Reservas y operación':{en:'Bookings and operations','pt-BR':'Reservas e operação'},
  'Solo reservas activas; las finalizadas y pagadas pasan a Review':{en:'Active bookings only; completed and paid bookings move to Review','pt-BR':'Somente reservas ativas; as finalizadas e pagas passam para Avaliações'},
  'Fecha':{en:'Date','pt-BR':'Data'},
  'Experiencia':{en:'Experience','pt-BR':'Experiência'},
  'Pax':{en:'Pax','pt-BR':'Pax'},
  'Estado':{en:'Status','pt-BR':'Status'},
  'Directa':{en:'Direct','pt-BR':'Direta'},
  'Derivada integral':{en:'Fully delegated','pt-BR':'Terceirizada integral'},
  'Derivada parcial':{en:'Partially delegated','pt-BR':'Terceirizada parcial'},
  'Coordinado':{en:'Coordinated','pt-BR':'Coordenado'},
  'En curso':{en:'In progress','pt-BR':'Em andamento'},
  'Completado':{en:'Completed','pt-BR':'Concluído'},
  'Cancelado':{en:'Cancelled','pt-BR':'Cancelado'},
  'Operación inmediata':{en:'Immediate operations','pt-BR':'Operação imediata'},
  'Bloqueos':{en:'Blockers','pt-BR':'Bloqueios'},
  'Coordinaciones':{en:'Coordination','pt-BR':'Coordenações'},
  'Acciones recomendadas':{en:'Recommended actions','pt-BR':'Ações recomendadas'},
  'pickup por confirmar':{en:'pickup to confirm','pt-BR':'pickup a confirmar'},
  'precio de adquisición pendiente':{en:'acquisition price pending','pt-BR':'preço de aquisição pendente'},

  // Public registration
  'Solicitud recibida.':{en:'Request received.','pt-BR':'Solicitação recebida.'},
  'Nueva solicitud':{en:'New request','pt-BR':'Nova solicitação'},
  'Reserva de experiencias · San Pedro de Atacama':{en:'Experience booking · San Pedro de Atacama','pt-BR':'Reserva de experiências · San Pedro de Atacama'},
  'Elige.':{en:'Choose.','pt-BR':'Escolha.'},
  'Registra.':{en:'Register.','pt-BR':'Cadastre.'},
  'Disfruta.':{en:'Enjoy.','pt-BR':'Aproveite.'},
  'Este formulario permite solicitar una o varias experiencias del catálogo vigente. Nuestro equipo revisa disponibilidad, horarios y condiciones antes de confirmar la reserva y el pago.':{en:'Use this form to request one or more experiences from our current catalog. Our team will review availability, schedules and conditions before confirming the booking and payment.','pt-BR':'Use este formulário para solicitar uma ou mais experiências do catálogo vigente. Nossa equipe verificará disponibilidade, horários e condições antes de confirmar a reserva e o pagamento.'},
  'ENLACE PERSONALIZADO':{en:'PERSONALIZED LINK','pt-BR':'LINK PERSONALIZADO'},
  'El alojamiento y el canal ya quedaron identificados desde este enlace/QR.':{en:'The accommodation and channel were already identified from this link/QR.','pt-BR':'A hospedagem e o canal já foram identificados por este link/QR.'},
  'Elige':{en:'Choose','pt-BR':'Escolha'},
  'Selecciona tus experiencias del catálogo.':{en:'Select your experiences from the catalog.','pt-BR':'Selecione suas experiências no catálogo.'},
  'Registra':{en:'Register','pt-BR':'Cadastre'},
  'Completa tus datos y alojamiento.':{en:'Complete your details and accommodation.','pt-BR':'Preencha seus dados e hospedagem.'},
  'Solicita':{en:'Request','pt-BR':'Solicite'},
  'Agrega todos los productos necesarios.':{en:'Add all the experiences you need.','pt-BR':'Adicione todas as experiências necessárias.'},
  'Confirma':{en:'Confirm','pt-BR':'Confirme'},
  'Revisamos disponibilidad y pago.':{en:'We review availability and payment.','pt-BR':'Verificamos disponibilidade e pagamento.'},
  'Datos del pasajero':{en:'Passenger details','pt-BR':'Dados do passageiro'},
  'Usaremos esta información para identificar la solicitud y comunicarnos contigo.':{en:'We will use this information to identify your request and contact you.','pt-BR':'Usaremos estas informações para identificar sua solicitação e entrar em contato.'},
  'Nombre completo *':{en:'Full name *','pt-BR':'Nome completo *'},
  'Nombre y apellidos':{en:'First and last name','pt-BR':'Nome e sobrenome'},
  'Correo electrónico *':{en:'Email *','pt-BR':'E-mail *'},
  'correo@ejemplo.com':{en:'email@example.com','pt-BR':'email@exemplo.com'},
  'Teléfono / WhatsApp *':{en:'Phone / WhatsApp *','pt-BR':'Telefone / WhatsApp *'},
  'Nacionalidad':{en:'Nationality','pt-BR':'Nacionalidade'},
  'Ej. Brasileña':{en:'E.g. Brazilian','pt-BR':'Ex. Brasileira'},
  'Documento / Pasaporte':{en:'ID / Passport','pt-BR':'Documento / Passaporte'},
  'RUT, DNI o pasaporte':{en:'ID number or passport','pt-BR':'CPF, RG ou passaporte'},
  'Fecha de nacimiento':{en:'Date of birth','pt-BR':'Data de nascimento'},
  'Tu estadía':{en:'Your stay','pt-BR':'Sua estadia'},
  'Nos ayuda a coordinar recogidas, horarios y contacto con recepción.':{en:'This helps us coordinate pickups, schedules and reception contact.','pt-BR':'Isso nos ajuda a coordenar pickups, horários e contato com a recepção.'},
  'Hotel / alojamiento *':{en:'Hotel / accommodation *','pt-BR':'Hotel / hospedagem *'},
  'Hotel / alojamiento':{en:'Hotel / accommodation','pt-BR':'Hotel / hospedagem'},
  'Origen de la solicitud':{en:'Request source','pt-BR':'Origem da solicitação'},
  'Recepción':{en:'Reception','pt-BR':'Recepção'},
  'Agencia':{en:'Agency','pt-BR':'Agência'},
  'Referido':{en:'Referral','pt-BR':'Indicação'},
  'Directo':{en:'Direct','pt-BR':'Direto'},
  'Restricciones / alimentación / movilidad':{en:'Restrictions / food / mobility','pt-BR':'Restrições / alimentação / mobilidade'},
  'Alergias, dieta, movilidad reducida u otra información importante':{en:'Allergies, diet, reduced mobility or other important information','pt-BR':'Alergias, dieta, mobilidade reduzida ou outra informação importante'},
  'Elige tus experiencias':{en:'Choose your experiences','pt-BR':'Escolha suas experiências'},
  'El listado se alimenta del catálogo vigente de Hotel Experience.':{en:'The list comes from the current Hotel Experience catalog.','pt-BR':'A lista vem do catálogo vigente da Hotel Experience.'},
  'Eliminar':{en:'Remove','pt-BR':'Excluir'},
  'Experiencia *':{en:'Experience *','pt-BR':'Experiência *'},
  'Seleccionar experiencia':{en:'Select an experience','pt-BR':'Selecionar experiência'},
  'Fecha preferida':{en:'Preferred date','pt-BR':'Data preferida'},
  'N° pasajeros':{en:'No. of passengers','pt-BR':'Nº de passageiros'},
  'Observación':{en:'Notes','pt-BR':'Observação'},
  'Privado, horario, preferencia...':{en:'Private, schedule, preference...','pt-BR':'Privado, horário, preferência...'},
  'Agregar otra experiencia':{en:'Add another experience','pt-BR':'Adicionar outra experiência'},
  'Notas generales':{en:'General notes','pt-BR':'Observações gerais'},
  'Información adicional':{en:'Additional information','pt-BR':'Informações adicionais'},
  'Revisa antes de enviar':{en:'Review before submitting','pt-BR':'Revise antes de enviar'},
  'Enviar la solicitud no garantiza disponibilidad. Hotel Experience confirmará cada experiencia.':{en:'Submitting the request does not guarantee availability. Hotel Experience will confirm each experience.','pt-BR':'Enviar a solicitação não garante disponibilidade. A Hotel Experience confirmará cada experiência.'},
  'Pasajero':{en:'Passenger','pt-BR':'Passageiro'},
  'Fecha por definir':{en:'Date to be confirmed','pt-BR':'Data a definir'},
  'Confirmo que los datos ingresados son correctos y autorizo su uso para gestionar esta solicitud turística.':{en:'I confirm that the information entered is correct and authorize its use to manage this travel request.','pt-BR':'Confirmo que os dados informados estão corretos e autorizo seu uso para gerenciar esta solicitação turística.'},
  'Volver':{en:'Back','pt-BR':'Voltar'},
  'Continuar':{en:'Continue','pt-BR':'Continuar'},
  'Enviando...':{en:'Sending...','pt-BR':'Enviando...'},
  'Enviar solicitud':{en:'Send request','pt-BR':'Enviar solicitação'},
  'Resumen':{en:'Summary','pt-BR':'Resumo'},
  'Aún sin completar':{en:'Not completed yet','pt-BR':'Ainda não preenchido'},
  'Canal':{en:'Channel','pt-BR':'Canal'},
  'Aún sin seleccionar':{en:'Not selected yet','pt-BR':'Ainda não selecionado'},
  'Solicitud sin confirmar':{en:'Unconfirmed request','pt-BR':'Solicitação não confirmada'},
  'Completa nombre, correo y teléfono.':{en:'Complete your name, email and phone number.','pt-BR':'Preencha nome, e-mail e telefone.'},
  'Indica el hotel o alojamiento.':{en:'Enter the hotel or accommodation.','pt-BR':'Informe o hotel ou hospedagem.'},
  'Agrega al menos una experiencia.':{en:'Add at least one experience.','pt-BR':'Adicione pelo menos uma experiência.'},
  'Confirma que los datos son correctos.':{en:'Confirm that the information is correct.','pt-BR':'Confirme que os dados estão corretos.'},
  'No se pudo enviar la solicitud.':{en:'The request could not be sent.','pt-BR':'Não foi possível enviar a solicitação.'},

  // Login
  'CRM TURÍSTICO · SAN PEDRO DE ATACAMA':{en:'TRAVEL CRM · SAN PEDRO DE ATACAMA','pt-BR':'CRM DE TURISMO · SAN PEDRO DE ATACAMA'},
  'Operación clara.':{en:'Clear operations.','pt-BR':'Operação clara.'},
  'Equipo conectado.':{en:'Connected team.','pt-BR':'Equipe conectada.'},
  'Ventas, pasajeros, proveedores y operación de cada tour en un solo lugar.':{en:'Sales, passengers, suppliers and every tour operation in one place.','pt-BR':'Vendas, passageiros, fornecedores e operação de cada tour em um só lugar.'},
  'ACCESO INTERNO':{en:'INTERNAL ACCESS','pt-BR':'ACESSO INTERNO'},
  'Entrar al CRM':{en:'Sign in to CRM','pt-BR':'Entrar no CRM'},
  'Acceso conectado directamente a Supabase Auth.':{en:'Secure access connected directly to Supabase Auth.','pt-BR':'Acesso seguro conectado diretamente ao Supabase Auth.'},
  'Correo':{en:'Email','pt-BR':'E-mail'},
  'Contraseña':{en:'Password','pt-BR':'Senha'},
  'Ingresando...':{en:'Signing in...','pt-BR':'Entrando...'},
  'Entrar':{en:'Sign in','pt-BR':'Entrar'},
  'Las cuentas se crean desde Equipo por un administrador.':{en:'Accounts are created by an administrator from Team.','pt-BR':'As contas são criadas por um administrador em Equipe.'},
  'No se pudo iniciar sesión.':{en:'Could not sign in.','pt-BR':'Não foi possível entrar.'},

  // AI
  'Asistente Hotel Experience':{en:'Hotel Experience Assistant','pt-BR':'Assistente Hotel Experience'},
  'APOYO COMERCIAL + OPERACIONAL · API CONECTABLE':{en:'SALES + OPERATIONS SUPPORT · CONNECTABLE API','pt-BR':'APOIO COMERCIAL + OPERACIONAL · API CONECTÁVEL'},
  'Consulta CRM, catálogo y operación próxima.':{en:'Query CRM, catalog and upcoming operations.','pt-BR':'Consulte CRM, catálogo e próximas operações.'},
  'Ningún cambio se ejecuta sin tu confirmación.':{en:'No change is executed without your confirmation.','pt-BR':'Nenhuma alteração é executada sem sua confirmação.'},
  'API conectada':{en:'API connected','pt-BR':'API conectada'},
  'API compatible':{en:'Compatible API','pt-BR':'API compatível'},
  'Contexto de lead':{en:'Lead context','pt-BR':'Contexto do lead'},
  'CRM general':{en:'General CRM','pt-BR':'CRM geral'},
  'Configurar IA':{en:'Configure AI','pt-BR':'Configurar IA'},
  'CONTROL PREVENTIVO':{en:'PREVENTIVE CONTROL','pt-BR':'CONTROLE PREVENTIVO'},
  'Anomalías y contradicciones antes de operar':{en:'Anomalies and contradictions before operations','pt-BR':'Anomalias e contradições antes da operação'},
  'Actualizar':{en:'Refresh','pt-BR':'Atualizar'},
  'Pregunta o pide una acción: crear tarea, coordinar estado, fijar pickup, agregar nota…':{en:'Ask or request an action: create a task, coordinate status, set pickup, add a note…','pt-BR':'Pergunte ou peça uma ação: criar tarefa, coordenar status, definir pickup, adicionar nota…'},
  'CÓMO TRABAJA':{en:'HOW IT WORKS','pt-BR':'COMO FUNCIONA'},
  'Reglas integradas':{en:'Built-in rules','pt-BR':'Regras integradas'},
  'Analiza CRM, catálogo, reservas y salidas próximas.':{en:'Analyzes CRM, catalog, bookings and upcoming departures.','pt-BR':'Analisa CRM, catálogo, reservas e próximas saídas.'},
  'Revisa pickup, proveedor, pax, hoja de riesgo y responsables según el tipo de operación.':{en:'Checks pickup, supplier, pax, risk sheet and owners according to the operation type.','pt-BR':'Verifica pickup, fornecedor, pax, ficha de risco e responsáveis conforme o tipo de operação.'},
  'No inventa valores, recursos ni coordinaciones faltantes.':{en:'Does not invent prices, resources or missing coordination.','pt-BR':'Não inventa valores, recursos nem coordenações ausentes.'},
  'Puede preparar tareas, notas, estado operacional y pickup.':{en:'Can prepare tasks, notes, operational status and pickup.','pt-BR':'Pode preparar tarefas, notas, status operacional e pickup.'},
  'No puede cerrar tours, registrar pagos ni asignar proveedores automáticamente.':{en:'Cannot close tours, record payments or assign suppliers automatically.','pt-BR':'Não pode encerrar tours, registrar pagamentos nem atribuir fornecedores automaticamente.'},
  'Nada se modifica hasta que una persona pulse Confirmar.':{en:'Nothing changes until a person presses Confirm.','pt-BR':'Nada é alterado até que uma pessoa pressione Confirmar.'},
  'generando respuesta':{en:'generating response','pt-BR':'gerando resposta'},
  'Consultando CRM, catálogo y operación real':{en:'Checking CRM, catalog and real operations','pt-BR':'Consultando CRM, catálogo e operação real'},
  'Tú':{en:'You','pt-BR':'Você'},
  'Confirmar':{en:'Confirm','pt-BR':'Confirmar'},
  'Cancelar':{en:'Cancel','pt-BR':'Cancelar'},
  'Guardar':{en:'Save','pt-BR':'Salvar'},
  'Editar':{en:'Edit','pt-BR':'Editar'},
  'Archivar':{en:'Archive','pt-BR':'Arquivar'},
  'Reactivar':{en:'Reactivate','pt-BR':'Reativar'},

  // Add-ons
  'Centro de complementos':{en:'Add-ons center','pt-BR':'Central de complementos'},
  'Añade capacidades al CRM sin mezclar credenciales sensibles con la interfaz.':{en:'Add capabilities to the CRM without mixing sensitive credentials into the interface.','pt-BR':'Adicione capacidades ao CRM sem misturar credenciais sensíveis à interface.'},
  'Disponibles':{en:'Available','pt-BR':'Disponíveis'},
  'Conectados':{en:'Connected','pt-BR':'Conectados'},
  'Conectar':{en:'Connect','pt-BR':'Conectar'},
  'Desconectar':{en:'Disconnect','pt-BR':'Desconectar'},
  'Configuración pendiente':{en:'Configuration pending','pt-BR':'Configuração pendente'},
  'Conectado':{en:'Connected','pt-BR':'Conectado'},
  'Disponible':{en:'Available','pt-BR':'Disponível'},
  'Error':{en:'Error','pt-BR':'Erro'},
  'Comunicación':{en:'Communication','pt-BR':'Comunicação'},
  'Productividad':{en:'Productivity','pt-BR':'Produtividade'},
  'Documentos':{en:'Documents','pt-BR':'Documentos'},
  'Infraestructura':{en:'Infrastructure','pt-BR':'Infraestrutura'},
  'Personalizado':{en:'Custom','pt-BR':'Personalizado'},
  'Complemento personalizado':{en:'Custom add-on','pt-BR':'Complemento personalizado'},
  'Enviar correo':{en:'Send email','pt-BR':'Enviar e-mail'},
  'Historial de enviados':{en:'Sent history','pt-BR':'Histórico de enviados'},
  'Crear eventos':{en:'Create events','pt-BR':'Criar eventos'},
  'Consultar agenda':{en:'Check calendar','pt-BR':'Consultar agenda'},
  'Disponibilidad':{en:'Availability','pt-BR':'Disponibilidade'},
  'Guardar archivos':{en:'Save files','pt-BR':'Salvar arquivos'},
  'Versionar documentos':{en:'Version documents','pt-BR':'Versionar documentos'},
  'Abrir carpetas':{en:'Open folders','pt-BR':'Abrir pastas'},
  'Correo transaccional':{en:'Transactional email','pt-BR':'E-mail transacional'},
  'Automatizaciones':{en:'Automations','pt-BR':'Automações'},
  'Versiones':{en:'Versions','pt-BR':'Versões'},
  'Commits':{en:'Commits','pt-BR':'Commits'},
  'Estado técnico':{en:'Technical status','pt-BR':'Status técnico'},
  'Deployments':{en:'Deployments','pt-BR':'Deployments'},
  'Builds':{en:'Builds','pt-BR':'Builds'},
  'Runtime':{en:'Runtime','pt-BR':'Runtime'},
  'Contactos':{en:'Contacts','pt-BR':'Contatos'},
  'Empresas':{en:'Companies','pt-BR':'Empresas'},
  'Endpoint personalizado':{en:'Custom endpoint','pt-BR':'Endpoint personalizado'},

  // Operations directory / records
  'Agregar al directorio operacional':{en:'Add to operations directory','pt-BR':'Adicionar ao diretório operacional'},
  'CAPTURA RÁPIDA':{en:'QUICK CAPTURE','pt-BR':'CADASTRO RÁPIDO'},
  'Proveedor':{en:'Supplier','pt-BR':'Fornecedor'},
  'Prestador':{en:'Service provider','pt-BR':'Prestador'},
  'Vehículo':{en:'Vehicle','pt-BR':'Veículo'},
  'Insumo':{en:'Resource','pt-BR':'Insumo'},
  'Nombre *':{en:'Name *','pt-BR':'Nome *'},
  'CONTACTO / EMPRESA':{en:'CONTACT / COMPANY','pt-BR':'CONTATO / EMPRESA'},
  'TELÉFONO':{en:'PHONE','pt-BR':'TELEFONE'},
  'EMAIL':{en:'EMAIL','pt-BR':'E-MAIL'},
  'NOTAS':{en:'NOTES','pt-BR':'OBSERVAÇÕES'},
  'Guardar en base de datos':{en:'Save to database','pt-BR':'Salvar no banco de dados'},
  'Buscar proveedor, prestador, teléfono, especialidad o insumo...':{en:'Search supplier, provider, phone, specialty or resource...','pt-BR':'Buscar fornecedor, prestador, telefone, especialidade ou insumo...'},
  'Prestadores activos':{en:'Active providers','pt-BR':'Prestadores ativos'},
  'Vehículos registrados':{en:'Registered vehicles','pt-BR':'Veículos cadastrados'},
  'Alertas de insumos':{en:'Resource alerts','pt-BR':'Alertas de insumos'},
  'Objetivo':{en:'Goal','pt-BR':'Objetivo'},
  'Salida lista':{en:'Departure ready','pt-BR':'Saída pronta'},
  'Prestadores de servicios':{en:'Service providers','pt-BR':'Prestadores de serviços'},
  'Base de datos de personas disponibles para ejecutar la operación.':{en:'Database of people available to run operations.','pt-BR':'Banco de dados de pessoas disponíveis para executar a operação.'},
  'Nuevo prestador':{en:'New provider','pt-BR':'Novo prestador'},
  'No hay prestadores individuales cargados.':{en:'No individual service providers have been added.','pt-BR':'Não há prestadores individuais cadastrados.'},
  'Editar / archivar':{en:'Edit / archive','pt-BR':'Editar / arquivar'},

  // Product categories / common tour names
  'Tours':{en:'Tours','pt-BR':'Tours'},
  'Otros servicios':{en:'Other services','pt-BR':'Outros serviços'},
  'Otro / Por definir':{en:'Other / To be defined','pt-BR':'Outro / A definir'},
  'Transfer Aeropuerto':{en:'Airport Transfer','pt-BR':'Transfer Aeroporto'},
  'Transfer Hito Cajón':{en:'Hito Cajón Transfer','pt-BR':'Transfer Hito Cajón'},
  'Valle de la Luna':{en:'Moon Valley','pt-BR':'Vale da Lua'},
  'Géiseres del Tatio':{en:'Tatio Geysers','pt-BR':'Gêiseres do Tatio'},
  'Geiseres del Tatio':{en:'Tatio Geysers','pt-BR':'Gêiseres do Tatio'},
  'Ruta de los Salares':{en:'Salt Flats Route','pt-BR':'Rota dos Salares'},
  'Piedras Rojas':{en:'Red Stones','pt-BR':'Piedras Rojas'},
  'Termas de Puritama':{en:'Puritama Hot Springs','pt-BR':'Termas de Puritama'},
  'Valle del Arcoiris':{en:'Rainbow Valley','pt-BR':'Vale do Arco-Íris'},
  'Valle del Arcoiris y Yerbas Buenas':{en:'Rainbow Valley and Yerbas Buenas','pt-BR':'Vale do Arco-Íris e Yerbas Buenas'},
  'Vallecito / Magic Bus':{en:'Vallecito / Magic Bus','pt-BR':'Vallecito / Magic Bus'},
  'Experiencia Astronómica / Astrofotografía':{en:'Astronomy Experience / Astrophotography','pt-BR':'Experiência Astronômica / Astrofotografia'},
  'Astronomico':{en:'Astronomy Tour','pt-BR':'Tour Astronômico'},
  'Astronómico':{en:'Astronomy Tour','pt-BR':'Tour Astronômico'},
  'Lagunas Escondidas de Baltinache':{en:'Hidden Lagoons of Baltinache','pt-BR':'Lagoas Escondidas de Baltinache'},
  'Globo Aerostático':{en:'Hot Air Balloon','pt-BR':'Balão de Ar Quente'},
  'Cabalgatas':{en:'Horseback Riding','pt-BR':'Cavalgadas'},
  'Cerro Toco':{en:'Cerro Toco','pt-BR':'Cerro Toco'},
  'Volcán Láscar':{en:'Láscar Volcano','pt-BR':'Vulcão Láscar'},
  'Sandboard':{en:'Sandboarding','pt-BR':'Sandboard'},
  'Uyuni 3 días / 2 noches':{en:'Uyuni 3 days / 2 nights','pt-BR':'Uyuni 3 dias / 2 noites'},
  'Uyuni 4 días / 3 noches':{en:'Uyuni 4 days / 3 nights','pt-BR':'Uyuni 4 dias / 3 noites'},
};

const textState=new WeakMap<Text,{original:string;last:string}>();
const attrState=new WeakMap<Element,Map<string,{original:string;last:string}>>();

function dynamic(text:string,language:AppLanguage):string{
  if(language==='es')return text;
  const T=(en:string,pt:string)=>language==='en'?en:pt;
  let m:RegExpMatchArray|null;
  if((m=text.match(/^Paso (\d+) de (\d+)$/)))return T(`Step ${m[1]} of ${m[2]}`,`Etapa ${m[1]} de ${m[2]}`);
  if((m=text.match(/^Experiencia (\d+)$/)))return T(`Experience ${m[1]}`,`Experiência ${m[1]}`);
  if((m=text.match(/^(\d+) experiencia\(s\)$/)))return T(`${m[1]} experience(s)`,`${m[1]} experiência(s)`);
  if((m=text.match(/^(\d+) pasajero\(s\)$/)))return T(`${m[1]} passenger(s)`,`${m[1]} passageiro(s)`);
  if((m=text.match(/^(\d+) servicios?$/)))return T(`${m[1]} service${m[1]==='1'?'':'s'}`,`${m[1]} serviço${m[1]==='1'?'':'s'}`);
  if((m=text.match(/^(\d+) experiencia\(s\)$/)))return T(`${m[1]} experience(s)`,`${m[1]} experiência(s)`);
  if((m=text.match(/^(\d+) experiencia\(s\) registrada\(s\)$/)))return T(`${m[1]} registered experience(s)`,`${m[1]} experiência(s) registrada(s)`);
  if((m=text.match(/^(\d+) oculto\(s\) por baja señal$/)))return T(`${m[1]} hidden due to low signal`,`${m[1]} oculto(s) por sinal baixo`);
  if((m=text.match(/^(\d+) días sin movimiento$/)))return T(`${m[1]} days without activity`,`${m[1]} dias sem atividade`);
  if((m=text.match(/^Checkout (.+) · fuera de ventana comercial$/)))return T(`Checkout ${m[1]} · outside sales window`,`Checkout ${m[1]} · fora da janela comercial`);
  if((m=text.match(/^Estadía (.+) · fuera de ventana comercial$/)))return T(`Stay ${m[1]} · outside sales window`,`Estadia ${m[1]} · fora da janela comercial`);
  if((m=text.match(/^Registramos tus datos y (\d+) experiencia\(s\)\.$/)))return T(`We registered your information and ${m[1]} experience(s).`,`Registramos seus dados e ${m[1]} experiência(s).`);
  if((m=text.match(/^Hay una acción prioritaria: (.+)$/)))return T(`There is one priority action: ${m[1]}`,`Há uma ação prioritária: ${m[1]}`);
  return text;
}

export function translateUiText(value:string,language:AppLanguage):string{
  if(language==='es')return value;
  const lead=value.match(/^(\s*)(.*?)(\s*)$/s);
  if(!lead)return value;
  const [,before,core,after]=lead;
  if(!core)return value;
  const translated=D[core]?.[language]||dynamic(core,language);
  return `${before}${translated}${after}`;
}

function blocked(node:Node){
  const parent=node.nodeType===Node.ELEMENT_NODE?node as Element:node.parentElement;
  return Boolean(parent?.closest('script,style,code,pre,[data-no-translate="true"]'));
}

function processText(node:Text,language:AppLanguage){
  if(blocked(node))return;
  const current=node.nodeValue||'';
  if(!current.trim())return;
  let state=textState.get(node);
  if(!state){state={original:current,last:current};textState.set(node,state)}
  else if(current!==state.last){state.original=current}
  const next=translateUiText(state.original,language);
  state.last=next;
  if(current!==next)node.nodeValue=next;
}

const ATTRS=['placeholder','title','aria-label'];
function processElement(el:Element,language:AppLanguage){
  if(blocked(el))return;
  let states=attrState.get(el);
  if(!states){states=new Map();attrState.set(el,states)}
  for(const attr of ATTRS){
    if(!el.hasAttribute(attr))continue;
    const current=el.getAttribute(attr)||'';
    let state=states.get(attr);
    if(!state){state={original:current,last:current};states.set(attr,state)}
    else if(current!==state.last){state.original=current}
    const next=translateUiText(state.original,language);
    state.last=next;
    if(current!==next)el.setAttribute(attr,next);
  }
}

function walk(root:Node,language:AppLanguage){
  if(root.nodeType===Node.TEXT_NODE){processText(root as Text,language);return}
  if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_FRAGMENT_NODE&&root.nodeType!==Node.DOCUMENT_NODE)return;
  if(root.nodeType===Node.ELEMENT_NODE)processElement(root as Element,language);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
  let node:Node|null;
  while((node=walker.nextNode())){
    if(node.nodeType===Node.TEXT_NODE)processText(node as Text,language);
    else if(node.nodeType===Node.ELEMENT_NODE)processElement(node as Element,language);
  }
}

export default function LocalizationBridge(){
  const {language}=useLanguage();
  useEffect(()=>{
    const root=document.body;
    document.title=language==='en'?'Hotel Experience · Travel CRM':language==='pt-BR'?'Hotel Experience · CRM de Turismo':'Hotel Experience · CRM Turístico';
    const originalAlert=window.alert;
    window.alert=((message?:any)=>originalAlert(translateUiText(String(message??''),language))) as typeof window.alert;
    walk(root,language);
    let applying=false;
    const observer=new MutationObserver(records=>{
      if(applying)return;
      applying=true;
      try{
        for(const record of records){
          if(record.type==='characterData')processText(record.target as Text,language);
          else if(record.type==='attributes')processElement(record.target as Element,language);
          else for(const node of Array.from(record.addedNodes))walk(node,language);
        }
      }finally{applying=false}
    });
    observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
    return()=>{observer.disconnect();window.alert=originalAlert};
  },[language]);
  return null;
}
