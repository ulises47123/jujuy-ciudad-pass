# Estructura del Proyecto: Jujuy Ciudad Pass

## Entidades Principales
1. **Turista**: Usuario que visita la ciudad. Elige su tiempo de estadía, sus intereses (Historia, Cultura, Naturaleza, Sabores, etc.) y completa misiones (visitas a lugares, responder preguntas, escanear QR) para acumular "Puntos de Experiencia". Estos puntos se pueden canjear por beneficios en comercios locales y obtener insignias (niveles de progreso).
2. **Residente (Local)**: Usuario que vive en Jujuy. Su objetivo no es competir con el turista, sino acumular "Puntos de Comunidad" al recomendar lugares, redescubrir la ciudad y participar en actividades. Pueden convertirse en embajadores locales.
3. **Administración (Municipalidad y Comercios)**: Encargados de visualizar los datos estadísticos sobre los lugares más y menos visitados. Permite actualizar actividades e información, además de relevar datos para mejorar la propuesta turística y económica.

## Temática de Colores (Diseño)
El diseño está inspirado en la descripción visual del logo y la interfaz móvil:
* **Azul Marino / Azul Claro**: Usado para encabezados, el logotipo principal, barras de progreso y la sección de información municipal. Representa formalidad e información institucional.
* **Fucsia / Púrpura**: Usado para detalles, subtítulos y llamados a la acción destacados ("CIUDAD PASS", beneficios).
* **Verde**: Específico para la modalidad *Turista*, botones principales de turista y acciones de personalización.
* **Naranja**: Específico para la modalidad *Residente* y para destacar bonus o notificaciones especiales.

## Estructura de Archivos
* `index.html`: Maquetado principal de la aplicación web, que divide la experiencia para los tres tipos de entidades.
* `style.css`: Archivo de estilos con las variables CSS para mantener la paleta de colores.
