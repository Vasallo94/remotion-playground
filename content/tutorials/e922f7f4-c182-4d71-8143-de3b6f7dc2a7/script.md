# Cuando ya basta

**Objetivo:** Explicar que el mejor siguiente paso puede ser no añadir nada cuando el resultado ya cumple su propósito.
**Audiencia:** Equipos de producto e ingeniería.
**Tono:** Educativo, sobrio, directo, minimalista.

## Escenas

### 1. Cuando ya basta

- **Tipo:** intro
- **Función narrativa:** Abrir el vídeo con el título exacto y orientar al espectador al tema central.
- **Tipo visual:** builtin
- **Rol visual:** Hook de apertura tipográfica mínima.
- **Plan de props:** `{"type":"intro","title":"Cuando ya basta","subtitle":null,"pixelLogo":{"enabled":false},"durationInSeconds":3}`
- **Razón visual:** La escena intro registrada es la opción más simple y correcta para presentar el título exacto sin añadir complejidad visual ni assets.
- **Duración:** 3s
- **Notas visuales:** Tarjeta de apertura simple en 16:9 horizontal con tema betelgeuse, fondo limpio de alto contraste y texto centrado dentro de márgenes seguros. Sin logo, firma, marca ni watermark. Sin elementos decorativos extra.
- **Notas de riesgo:**
  - Verificar que la configuración global desactive watermark y signature fuera de la escena.
  - Mantener tamaño de texto legible para LinkedIn/web dentro de safe margins.

### 2. Si ya cumple, detente

- **Tipo:** callout
- **Función narrativa:** Presentar la idea principal como takeaway claro y memorable.
- **Tipo visual:** builtin
- **Rol visual:** Énfasis conceptual en una sola frase.
- **Plan de props:** `{"type":"callout","text":"Si ya cumple, detente","position":"center","background":"solid","durationInSeconds":3}`
- **Razón visual:** La escena callout registrada permite enfatizar una única lección con máxima claridad en muy poco tiempo, adecuada para un vídeo silencioso.
- **Duración:** 3s
- **Notas visuales:** Callout centrado con texto único y breve, alto contraste, fondo sólido o overlay oscuro consistente con betelgeuse. Sin iconos ni apoyo visual externo. Márgenes seguros amplios.
- **Notas de riesgo:**
  - Comprobar contraste suficiente entre fondo y texto.
  - No exceder una línea o, si parte en dos, mantener equilibrio visual.

### 3. Menos proceso. Más resultado.

- **Tipo:** outro
- **Función narrativa:** Cerrar con síntesis memorable y reforzar la filosofía de detenerse cuando ya se cumplió el propósito.
- **Tipo visual:** builtin
- **Rol visual:** Cierre/resumen final minimalista.
- **Plan de props:** `{"type":"outro","title":"Menos proceso. Más resultado.","bullets":[],"durationInSeconds":3}`
- **Razón visual:** La escena outro registrada funciona como cierre natural del mensaje y permite terminar con una frase de resumen sin introducir nuevos elementos.
- **Duración:** 3s
- **Notas visuales:** Cierre tipográfico simple con la frase final exacta como mensaje principal, sin bullets visibles adicionales, centrado y con composición limpia. Tema betelgeuse, alto contraste, safe margins, sin branding.
- **Notas de riesgo:**
  - Si bullets vacíos no son aceptados por el runtime, usar null para mantener solo el título.
  - Validar que la frase final quede suficientemente grande y centrada para 3 segundos.

## Notas

Script ajustado al target exacto target.video.001 y a sus capacidades: video/mp4, 1280x720, 30 fps, horizontal 16:9, tema betelgeuse. Estructura exacta de 3 escenas registradas y simples: intro 3 s, callout 3 s, outro 3 s. Sin voz, música, efectos, assets, investigación externa, marca, logo, firma ni watermark. Todas las decisiones humanas requieren aprobación desde el navegador.
