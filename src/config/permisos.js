const PERMISOS_DEFAULT = {
  ADMIN: ['*'],
  COBRADOR: [
    'ruta',
    'clientes.ver',
    'clientes.crear',
    'prestamos.crear',
    'prestamos.renovar',
    'cobros',
    'no_pago',
    'cierre_caja',
  ],
  CONTADOR: ['reportes'],
};

const LABELS = {
  ruta: 'Ruta diaria',
  'clientes.ver': 'Ver clientes asignados',
  'clientes.crear': 'Crear clientes',
  'prestamos.crear': 'Crear prestamos',
  'prestamos.renovar': 'Renovar prestamos',
  cobros: 'Registrar cobros',
  no_pago: 'Gestion de no pago',
  cierre_caja: 'Cierre de caja',
  reportes: 'Reportes financieros',
  clientes: 'Gestion clientes (admin)',
  cobradores: 'Gestion cobradores',
  rutas: 'Asignar rutas',
  permisos: 'Configurar permisos',
  renovaciones: 'Aprobar renovaciones (admin)',
  prorrogas: 'Prorrogas',
};

module.exports = { PERMISOS_DEFAULT, LABELS };
