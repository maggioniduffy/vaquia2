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
    sendMagicLink: "Enviar enlace por email",
    usePassword: "Ingresar con contraseña",
    useMagicLink: "Ingresar con enlace por email",
    magicLinkSent: "Revisar el email: enviamos un enlace para ingresar.",
    invalidCredentials: "Email o contraseña incorrectos.",
    genericError: "No se pudo ingresar. Intentar de nuevo.",
    linkExpired: "El enlace venció o ya se usó. Pedir uno nuevo.",
    signOut: "Salir",
    noMembership: "Este usuario no pertenece a ninguna empresa. Contactar al administrador.",
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
