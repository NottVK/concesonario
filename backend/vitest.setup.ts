// Las pruebas existentes cubren TODAS las tools y el prompt v2; el valor por defecto de producción (solo ficha por VIN)
// se prueba aparte, borrando estas variables dentro de cada prueba.
process.env.CHAT_ALLOWED_TOOLS = 'buscar_vehiculos,detalle_vehiculo,comparar_vehiculos,simular_credito,agendar_cita,preguntar_a_otro_bot,consultar_ficha_vin';
process.env.CHAT_PROMPT_VERSION = 'v2';
