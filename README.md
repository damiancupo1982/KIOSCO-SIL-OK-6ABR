# Sistema POS Kiosco Damian

Sistema completo de Punto de Venta (POS) para kioscos y comercios pequeños. Desarrollado con React, TypeScript, Tailwind CSS y Supabase.

## Características

- **Gestión de Inventario**: Control completo de productos con alertas de stock bajo
- **Movimientos de Inventario**: Registro detallado de entradas y salidas con trazabilidad completa
- **Sistema de Ventas**: Interfaz moderna tipo POS para procesamiento rápido de ventas
- **Gestión de Caja**: Control de ingresos y egresos con múltiples métodos de pago
- **Detalles de Transacciones**: Vista completa de cada transacción con desglose de ventas e items
- **Reportes y Estadísticas**: Análisis detallado de ventas con filtros por período
- **Gestión de Turnos**: Control de turnos de trabajo con cálculo automático de totales
- **Sistema de Backup**: Protección de datos con backups descargables en formato JSON
- **Diseño Responsive**: Funciona perfectamente en dispositivos móviles, tablets y desktop

## Novedades Recientes

### Movimientos de Inventario
Ahora puedes llevar un control detallado de todas las entradas y salidas de productos:
- Registra ingresos de mercadería con información del proveedor
- Rastrea todas las salidas de productos
- Filtra por fecha, tipo de movimiento, producto, proveedor o rubro
- Visualiza estadísticas de movimientos en tiempo real

### Detalle Completo de Transacciones
El módulo de Caja ahora incluye vista detallada de cada transacción:
- **Click en cualquier movimiento** para ver información completa
- **Para ventas**: desglose completo con todos los items vendidos
- **Desglose de pagos**: cuando hay múltiples métodos de pago
- **Información del cliente**: nombre y lote (si aplica)
- **Tabla de productos**: cantidades, precios unitarios y subtotales
- **Fecha y hora exacta** con segundos para mayor precisión

### Sistema de Backup y Restauración de Datos
Protección completa contra pérdida de datos:
- **Backup manual** con un solo click
- **Descarga en formato JSON** con todos los datos del sistema
- **Restauración completa** desde archivos de backup
- **Validación de archivos** antes de restaurar
- **Confirmación de seguridad** con advertencias claras
- **Progreso en tiempo real** durante la restauración
- **Registro del último backup** realizado
- **Incluye todas las tablas**: productos, ventas, caja, turnos, usuarios, configuración y movimientos
- **Preparado para envío automático por email** (próximamente)

## Tecnologías Utilizadas

### Frontend
- **React 18.3.1**: Librería principal para la interfaz de usuario
- **TypeScript 5.5.3**: Tipado estático para mayor seguridad del código
- **Vite 7.2.4**: Build tool y dev server ultra-rápido
- **Tailwind CSS 3.4.18**: Framework CSS utility-first para diseño moderno
- **Lucide React 0.344.0**: Librería de iconos moderna y limpia

### Backend & Database
- **Supabase**: Base de datos PostgreSQL con autenticación y API REST
- **@supabase/supabase-js 2.57.4**: Cliente oficial de Supabase

### Dev Tools
- **ESLint**: Linter para mantener código limpio
- **PostCSS & Autoprefixer**: Procesamiento de CSS

## Estructura del Proyecto

\`\`\`
kiosco-pos/
├── src/
│   ├── components/           # Componentes React
│   │   ├── Dashboard.tsx     # Componente principal con navegación
│   │   ├── Ventas.tsx        # Módulo de ventas (POS)
│   │   ├── Stock.tsx         # Gestión de inventario
│   │   ├── Movimientos.tsx   # Movimientos de inventario
│   │   ├── Caja.tsx          # Control de caja
│   │   ├── Reportes.tsx      # Reportes y estadísticas
│   │   └── Configuracion.tsx # Configuración del sistema
│   ├── lib/
│   │   └── supabase.ts       # Cliente y tipos de Supabase
│   ├── App.tsx               # Componente raíz
│   ├── main.tsx              # Punto de entrada
│   └── index.css             # Estilos globales (Tailwind)
├── public/                   # Archivos estáticos
├── supabase/
│   └── migrations/           # Migraciones de base de datos
├── dist/                     # Build de producción
├── .env                      # Variables de entorno
├── db-setup.sql              # Script de configuración de BD
├── package.json              # Dependencias y scripts
├── vite.config.ts            # Configuración de Vite
├── tailwind.config.js        # Configuración de Tailwind
└── tsconfig.json             # Configuración de TypeScript
\`\`\`

## Estructura de la Base de Datos

### Tabla: products
Almacena el inventario de productos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único del producto |
| code | text | Código único del producto |
| name | text | Nombre del producto |
| description | text | Descripción detallada |
| category | text | Categoría del producto |
| price | numeric | Precio de venta |
| cost | numeric | Costo del producto |
| stock | integer | Cantidad en stock |
| min_stock | integer | Stock mínimo (alertas) |
| active | boolean | Producto activo/inactivo |
| created_at | timestamptz | Fecha de creación |
| updated_at | timestamptz | Fecha de actualización |

### Tabla: sales
Registra todas las ventas realizadas.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único de la venta |
| sale_number | text | Número de venta (único) |
| date | timestamptz | Fecha y hora de la venta |
| user_id | uuid | ID del usuario vendedor |
| user_name | text | Nombre del vendedor |
| shift_id | uuid | ID del turno |
| items | jsonb | Items vendidos (array JSON) |
| subtotal | numeric | Subtotal de la venta |
| discount | numeric | Descuento aplicado |
| total | numeric | Total final |
| payment_method | text | Método de pago principal |
| payments | jsonb | Desglose de pagos múltiples (array JSON) |
| customer_name | text | Nombre del cliente (opcional) |
| customer_lot | text | Lote del cliente (opcional) |
| created_at | timestamptz | Fecha de creación |

### Tabla: cash_transactions
Registra movimientos de caja (ingresos y egresos).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único de la transacción |
| shift_id | uuid | ID del turno |
| type | text | Tipo: 'income' o 'expense' |
| category | text | Categoría del movimiento |
| amount | numeric | Monto de la transacción |
| payment_method | text | Método de pago |
| description | text | Descripción detallada |
| created_at | timestamptz | Fecha de creación |

### Tabla: inventory_movements
Registra movimientos de inventario (entradas y salidas).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único del movimiento |
| product_id | uuid | ID del producto |
| product_name | text | Nombre del producto |
| product_category | text | Categoría del producto |
| type | text | Tipo: 'entrada' o 'salida' |
| quantity | integer | Cantidad del movimiento |
| reason | text | Razón del movimiento |
| supplier | text | Proveedor (para entradas) |
| user_name | text | Usuario que registra |
| notes | text | Notas adicionales |
| created_at | timestamptz | Fecha de creación |

### Tabla: shifts
Controla los turnos de trabajo.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único del turno |
| user_id | uuid | ID del usuario |
| user_name | text | Nombre del usuario |
| start_date | timestamptz | Fecha/hora de inicio |
| end_date | timestamptz | Fecha/hora de cierre |
| opening_cash | numeric | Efectivo inicial |
| closing_cash | numeric | Efectivo final |
| total_sales | numeric | Total de ventas |
| total_expenses | numeric | Total de egresos |
| active | boolean | Turno activo/cerrado |
| created_at | timestamptz | Fecha de creación |

### Tabla: configuration
Configuración global del sistema.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único |
| business_name | text | Nombre del negocio |
| address | text | Dirección |
| phone | text | Teléfono |
| tax_id | text | CUIT/RUT |
| currency | text | Símbolo de moneda |
| receipt_message | text | Mensaje en ticket |
| updated_at | timestamptz | Última actualización |

## Instalación y Configuración

### 1. Clonar el Repositorio

\`\`\`bash
git clone <repository-url>
cd kiosco-pos
\`\`\`

### 2. Instalar Dependencias

\`\`\`bash
npm install
\`\`\`

### 3. Configurar Supabase

1. Crea una cuenta en [Supabase](https://supabase.com)
2. Crea un nuevo proyecto
3. Ve a **Settings** → **API** y copia:
   - `Project URL`
   - `anon/public key`

### 4. Configurar Variables de Entorno

Crea un archivo \`.env\` en la raíz del proyecto:

\`\`\`env
VITE_SUPABASE_URL=tu_supabase_url_aqui
VITE_SUPABASE_ANON_KEY=tu_supabase_anon_key_aqui
\`\`\`

### 5. Configurar la Base de Datos

1. Ve a tu proyecto de Supabase
2. Haz clic en **SQL Editor** en el menú lateral
3. Copia el contenido del archivo \`db-setup.sql\`
4. Pégalo en el editor y haz clic en **Run**

Esto creará todas las tablas necesarias con sus políticas de seguridad (RLS) e insertará productos de ejemplo.

### 6. Ejecutar el Proyecto

#### Modo Desarrollo

\`\`\`bash
npm run dev
\`\`\`

La aplicación estará disponible en \`http://localhost:5173\`

#### Build para Producción

\`\`\`bash
npm run build
\`\`\`

Los archivos compilados estarán en el directorio \`dist/\`

#### Preview del Build

\`\`\`bash
npm run preview
\`\`\`

## Módulos del Sistema

### 1. Ventas (POS)
**Ruta**: Dashboard → Ventas

**Funcionalidades**:
- Búsqueda rápida de productos
- Agregar productos al carrito con un clic
- Ajuste de cantidades (+ / -)
- Selección de método de pago (Efectivo, Transferencia, QR, Tarjeta)
- Cálculo automático de totales
- Actualización automática de stock
- Registro de transacciones en caja

**Flujo de Trabajo**:
1. Buscar o seleccionar productos
2. Ajustar cantidades en el carrito
3. Seleccionar método de pago
4. Completar venta
5. El sistema actualiza automáticamente stock y caja

### 2. Inventario (Stock)
**Ruta**: Dashboard → Inventario

**Funcionalidades**:
- Vista de tarjetas con información completa
- Búsqueda por nombre, código o categoría
- Alertas visuales de stock bajo
- Agregar nuevos productos
- Editar productos existentes
- Eliminar productos
- Indicadores de precio, costo y stock

**Datos Requeridos**:
- Código (único)
- Nombre
- Categoría (opcional)
- Precio de venta
- Costo (opcional)
- Stock actual
- Stock mínimo (para alertas)

### 3. Movimientos de Inventario
**Ruta**: Dashboard → Movimientos

**Funcionalidades**:
- Vista completa de entradas y salidas de productos
- Registro de ingresos de mercadería
- Trazabilidad completa por producto
- Filtros avanzados:
  - Por fecha (Hoy, Última semana, Último mes, Todo el período)
  - Por tipo (Entradas, Salidas, Todos)
  - Búsqueda por producto, proveedor o rubro
- Estadísticas visuales:
  - Total de entradas
  - Total de salidas
  - Cantidad de movimientos
- Información detallada de cada movimiento:
  - Fecha y hora
  - Tipo de movimiento
  - Producto y rubro
  - Cantidad
  - Proveedor
  - Usuario que registró
  - Notas

**Registro de Ingresos**:
- Selección de producto
- Cantidad a ingresar
- Nombre del proveedor
- Notas opcionales
- Actualización automática de stock

### 4. Caja
**Ruta**: Dashboard → Caja

**Funcionalidades**:
- Tarjetas con resumen financiero:
  - Ingresos totales (verde)
  - Egresos totales (rojo)
  - Balance (azul)
- Saldos por método de pago:
  - Caja efectivo
  - Transferencias
  - QR
  - Expensas
- Tabla detallada de movimientos
- **Vista detallada de transacciones**:
  - Click en cualquier movimiento para ver detalles completos
  - Para ventas: información completa con desglose de items
  - Desglose de pagos múltiples
  - Datos del cliente y lote (si aplica)
  - Tabla de productos vendidos con cantidades y precios
- Agregar ingresos/egresos manuales
- Filtros por período:
  - Solo este turno
  - Hoy
  - Última semana
  - Último mes
  - Rango personalizado
  - Todos
- Exportación a CSV
- Categorización de movimientos
- Múltiples métodos de pago

**Tipos de Movimientos**:
- **Ingresos**: Ventas (automático), Otros ingresos (manual)
- **Egresos**: Gastos, Pagos a proveedores, etc.

**Detalle de Transacciones**:
Cuando haces click en un movimiento de caja:
- Si es una venta, muestra:
  - Fecha y usuario
  - Método de pago y cliente
  - Lote (si existe)
  - Desglose de pagos (si hay múltiples métodos)
  - Tabla completa de items vendidos
  - Total de la venta
- Si es otro movimiento:
  - Tipo (Ingreso/Egreso)
  - Categoría y método de pago
  - Monto total
  - Descripción

### 5. Reportes
**Ruta**: Dashboard → Reportes

**Funcionalidades**:
- Filtros por período (Hoy, Semana, Mes, Todo)
- Métricas principales:
  - Ventas totales
  - Ticket promedio
  - Items vendidos
  - Tasa de crecimiento
- Análisis por método de pago
- Estadísticas detalladas
- Tabla de últimas 20 ventas
- Visualización de tendencias

**Métricas Calculadas**:
- Total de ventas en $
- Número de transacciones
- Promedio de venta
- Productos más vendidos
- Distribución por método de pago

### 6. Configuración
**Ruta**: Dashboard → Configuración

**Funcionalidades**:
- **Datos del Negocio**: Configuración de nombre, dirección, teléfono, CUIT y mensajes
- **Gestión de Usuarios**: Alta, modificación y eliminación de usuarios del sistema
- **Cierres de Turno**: Vista detallada de todos los cierres históricos con análisis de diferencias
- **Sistema de Backup**: Protección completa de datos

**Sistema de Backup y Restauración**:
El módulo incluye un sistema robusto de backup y restauración para proteger tus datos:

1. **Backup Manual**:
   - Descarga completa de toda la base de datos en formato JSON
   - Incluye: productos, ventas, movimientos de caja, turnos, usuarios, configuración y movimientos de inventario
   - Archivo descargable con timestamp en el nombre
   - Registro de fecha del último backup

2. **Restauración de Backup**:
   - Sube un archivo de backup previo para restaurar el sistema completo
   - Proceso con confirmación de seguridad
   - Elimina todos los datos actuales y los reemplaza con los del backup
   - Feedback en tiempo real del progreso de restauración
   - Recarga automática del sistema al finalizar

3. **Contenido del Backup**:
   - Metadata del sistema (fecha, versión)
   - Todas las tablas de la base de datos
   - Formato JSON legible y estructurado
   - Compatible para restauración completa

4. **Envío por Email** (Próximamente):
   - Configuración de backups automáticos programados
   - Envío directo a tu casilla de correo
   - Historial de backups enviados

5. **Recomendaciones**:
   - Realizar backups diariamente al finalizar el turno
   - Guardar en múltiples ubicaciones (PC, USB, nube)
   - Mantener al menos 30 días de backups
   - Verificar ocasionalmente que los archivos se abren correctamente
   - **IMPORTANTE**: Hacer un backup ANTES de restaurar uno antiguo

## Dependencias Principales

### Production Dependencies

\`\`\`json
{
  "@supabase/supabase-js": "^2.57.4",  // Cliente Supabase
  "lucide-react": "^0.344.0",          // Iconos
  "react": "^18.3.1",                  // UI Library
  "react-dom": "^18.3.1"               // React DOM
}
\`\`\`

### Development Dependencies

\`\`\`json
{
  "@vitejs/plugin-react": "^4.7.0",       // Plugin React para Vite
  "autoprefixer": "^10.4.22",             // PostCSS autoprefixer
  "eslint": "^9.9.1",                     // Linter
  "postcss": "^8.5.6",                    // PostCSS
  "tailwindcss": "^3.4.18",               // CSS Framework
  "typescript": "^5.5.3",                 // TypeScript
  "vite": "^7.2.4"                        // Build tool
}
\`\`\`

## Scripts Disponibles

\`\`\`bash
npm run dev        # Inicia servidor de desarrollo
npm run build      # Genera build de producción
npm run preview    # Preview del build de producción
npm run lint       # Ejecuta el linter
npm run typecheck  # Verifica tipos TypeScript
\`\`\`

## Seguridad

### Row Level Security (RLS)
Todas las tablas tienen habilitado RLS con políticas públicas para operaciones básicas. En un entorno de producción, se recomienda:

1. Implementar autenticación de usuarios
2. Restringir políticas RLS por usuario autenticado
3. Usar variables de entorno para credenciales sensibles
4. Implementar roles y permisos

### Variables de Entorno
Nunca subas el archivo \`.env\` al repositorio. Usa \`.env.example\` para documentar las variables necesarias.

## Seguridad y Backup

### Sistema de Backup y Restauración

El sistema incluye protección completa contra pérdida de datos con backups descargables y restauración:

#### Cómo hacer un backup:
1. Ingresa al módulo de Configuración con la clave de Súper Administrador (842114)
2. Ve a la pestaña "Backup"
3. Haz clic en "Descargar Backup Ahora"
4. El sistema descargará un archivo JSON con todos tus datos
5. Guarda el archivo en un lugar seguro

#### Cómo restaurar un backup:
1. Ingresa al módulo de Configuración → Backup
2. En la sección "Restaurar Backup", selecciona el archivo JSON de backup
3. Haz clic en "Restaurar Backup"
4. Lee cuidadosamente la advertencia en el modal de confirmación
5. Confirma la restauración (esto eliminará TODOS los datos actuales)
6. Espera a que termine el proceso (verás el progreso en pantalla)
7. El sistema se recargará automáticamente con los datos restaurados

**⚠️ ADVERTENCIA IMPORTANTE**: La restauración de backup eliminará TODOS los datos actuales del sistema y los reemplazará con los datos del archivo de backup. Esta acción NO se puede deshacer. **Siempre haz un backup de tus datos actuales ANTES de restaurar un backup antiguo**.

**Contenido del backup:**
- Productos e inventario completo
- Todas las ventas realizadas
- Movimientos de caja completos
- Historial de turnos
- Usuarios del sistema
- Configuración general
- Movimientos de inventario

**Mejores prácticas:**
- Realiza backups diariamente, preferentemente al finalizar el turno
- Guarda los archivos en múltiples ubicaciones (computadora local, pendrive, servicio en la nube como Google Drive o Dropbox)
- No elimines backups antiguos hasta tener varios respaldos nuevos
- Verifica ocasionalmente que puedes abrir los archivos de backup
- **Haz un backup ANTES de restaurar uno antiguo**
- Los archivos contienen información sensible, guárdalos en un lugar seguro
- Nombra tus backups de forma descriptiva para identificarlos fácilmente

**Formato del archivo:**
El backup se descarga en formato JSON con el nombre `backup-kiosco-damian-YYYY-MM-DD.json`, donde la fecha y hora indican cuándo se realizó el respaldo.

## Personalización

### Colores y Temas
Los colores están definidos en Tailwind CSS. Para cambiarlos, edita \`tailwind.config.js\`:

\`\`\`javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#10b981',  // Emerald
        secondary: '#3b82f6', // Blue
        // ... más colores
      }
    }
  }
}
\`\`\`

### Nombre del Negocio
El nombre "Kiosco Damian" está definido en:
- \`src/components/Dashboard.tsx\` (línea 40)
- Tabla \`configuration\` en la base de datos

## Características Técnicas

### Estado Global
- Gestión de estado con React Hooks (useState, useEffect)
- Prop drilling para datos del turno activo
- Estado local en cada componente

### Optimizaciones
- Build optimizado con Vite
- Code splitting automático
- Minificación de CSS y JS
- Imágenes y assets optimizados

### Responsive Design
- Mobile-first approach
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Grid system flexible de Tailwind

## Solución de Problemas

### No se muestran los productos
1. Verifica que ejecutaste el script \`db-setup.sql\`
2. Revisa las credenciales en \`.env\`
3. Verifica la conexión a internet
4. Revisa la consola del navegador para errores

### Error de conexión a Supabase
1. Verifica que las variables de entorno estén correctas
2. Asegúrate que el proyecto de Supabase esté activo
3. Revisa que la API key sea la correcta (anon/public)

### Error al compilar
1. Elimina \`node_modules\` y ejecuta \`npm install\`
2. Verifica la versión de Node (se recomienda 18+)
3. Limpia la caché de Vite: \`npm run build -- --force\`

## Próximas Características

- [x] Movimientos de inventario con trazabilidad completa
- [x] Detalle completo de transacciones en módulo de Caja
- [x] Visualización de items vendidos en cada transacción
- [x] Sistema de backup manual de base de datos
- [x] Restauración de backups con validación y confirmación
- [ ] Envío automático de backups por email
- [ ] Sistema de autenticación de usuarios
- [ ] Impresión de tickets/facturas
- [ ] Exportación de reportes a PDF/Excel
- [ ] Gráficos interactivos
- [ ] Gestión de proveedores
- [ ] Sistema de fidelización de clientes
- [ ] Modo offline con sincronización
- [ ] App móvil nativa
- [ ] Integración con MercadoPago/Stripe

## Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (\`git checkout -b feature/NuevaCaracteristica\`)
3. Commit tus cambios (\`git commit -m 'Agregar nueva característica'\`)
4. Push a la rama (\`git push origin feature/NuevaCaracteristica\`)
5. Abre un Pull Request

## Licencia

Este proyecto es de código abierto y está disponible bajo la licencia MIT.

## Autor

Sistema desarrollado para Kiosco Damian

## Soporte

Para reportar bugs o solicitar nuevas características, abre un issue en el repositorio.

---

**Versión**: 1.2.0
**Última actualización**: Febrero 2026
