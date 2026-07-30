const MAILPIT = "http://127.0.0.1:54324";

interface ResumenMail {
  ID: string;
}

/**
 * Devuelve el HTML del último mail recibido por `email`, reintentando unos
 * segundos porque el envío es asíncrono. Usa la API de Mailpit del atrapa-mails
 * que levanta la CLI de Supabase.
 */
export async function leerUltimoMail(email: string): Promise<string> {
  for (let intento = 0; intento < 20; intento++) {
    const res = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
    );
    if (res.ok) {
      const data = (await res.json()) as { messages?: ResumenMail[] };
      const ultimo = data.messages?.[0];
      if (ultimo) {
        const det = await fetch(`${MAILPIT}/api/v1/message/${ultimo.ID}`);
        const msg = (await det.json()) as { HTML?: string; Text?: string };
        return msg.HTML || msg.Text || "";
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No llegó ningún mail a ${email}`);
}

/** Extrae el primer link de verificación/recuperación del cuerpo del mail. */
export function extraerLinkDeAuth(cuerpo: string): string {
  // Supabase manda un link al endpoint /auth/v1/verify que luego redirige al
  // redirect_to. Tomamos el primer href http(s).
  const match = cuerpo.match(/href="(https?:\/\/[^"]+)"/i);
  if (!match) throw new Error("El mail no tenía ningún link");
  return match[1].replace(/&amp;/g, "&");
}
