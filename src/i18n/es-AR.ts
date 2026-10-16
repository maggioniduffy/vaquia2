// All UI copy (es-AR). Neutral imperative, no "vos". See docs/spec/design.md#Copy.
export const t = {
  app: {
    name: "Vaquia",
    description: "Plataforma HSE para empresas de servicios petroleros",
  },
  auth: {
    title: "Ingresar",
    email: "Email",
    password: "Contraseña",
    signIn: "Ingresar",
    sendCode: "Enviar código",
    usePassword: "Ingresar con contraseña",
    useCode: "Ingresar con código por email",
    code: "Código",
    resendCode: "Reenviar código",
    changeEmail: "Cambiar email",
    codeSent:
      "Si el email corresponde a un usuario, enviamos un código de 6 dígitos. Revisar la casilla.",
    codeInvalid: "El código es incorrecto. Revisarlo e intentar de nuevo.",
    codeExpired: "El código venció. Pedir uno nuevo.",
    codeTooManyAttempts: "Demasiados intentos. Pedir un código nuevo.",
    invalidCredentials: "Email o contraseña incorrectos.",
    genericError: "No se pudo ingresar. Intentar de nuevo.",
    guestSignIn: "Entrar como invitado",
    signOut: "Salir",
    noMembership: "Este usuario no pertenece a ninguna empresa. Contactar al administrador.",
  },
  email: {
    otpSubject: "Código para ingresar a Vaquia",
    otpBody: "Código para ingresar:",
    otpValidity: "Vence en 5 minutos. Si no se pidió este código, ignorar el mensaje.",
  },
  guest: {
    name: "Invitado",
  },
  company: {
    switcherLabel: "Empresa",
    switchError: "No se pudo cambiar de empresa.",
  },
  roles: {
    worker: "Operario",
    supervisor: "Supervisor",
    hse: "HSE",
    manager: "Gerencia",
    admin: "Administrador",
  },
  nav: {
    office: {
      dashboard: "Tablero",
      records: "Registros",
      people: "Personal",
      actions: "Acciones",
      reports: "Informes",
      settings: "Configuración",
    },
    field: {
      home: "Inicio",
      capture: "Nuevo",
      actions: "Mis acciones",
      sync: "Sincronizar",
    },
    toField: "Vista campo",
    toOffice: "Vista oficina",
  },
  empty: {
    dashboard: "Todavía no hay datos para mostrar.",
    records: "Todavía no hay registros.",
    people: "Todavía no hay personal cargado.",
    actions: "No hay acciones abiertas.",
    reports: "Todavía no hay informes mensuales.",
    settings: "Configuración de la empresa.",
    fieldHome: "Sin tareas pendientes.",
    fieldCapture: "Elegir el tipo de registro.",
    fieldActions: "No hay acciones asignadas.",
    fieldSync: "Todo sincronizado.",
  },
  common: {
    close: "Cerrar",
    cancel: "Cancelar",
    save: "Guardar",
    loading: "Cargando…",
  },
} as const;

export type Dictionary = typeof t;
