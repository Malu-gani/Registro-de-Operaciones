import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * Los 5 flujos críticos, end-to-end contra la app real y Supabase local.
 *
 * Cada test crea su propio usuario: el aislamiento lo da RLS, igual que en los
 * tests SQL, así que pueden correr en paralelo sin pisarse.
 *
 * Las aserciones de importes (9.000, 9.480) salen de las fórmulas de
 * `docs/financial-logic.md`. Si alguna falla, es un defecto del producto, no un
 * selector desactualizado.
 */

const PASSWORD = "Prueba1234!";
const PORTAFOLIO_POR_DEFECTO = "Mi Cuenta Principal";

/**
 * Corta las llamadas a los precios de mercado. El diseño de la suite deja las
 * APIs reales (Yahoo/CoinGecko) fuera del alcance automatizado: acá solo
 * estorbarían con latencia e intermitencia ajenas a lo que se está probando.
 */
async function sinDatosDeMercado(page: Page) {
  await page.route("**/api/market/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"results":[]}' })
  );
}

/**
 * Registra un usuario nuevo y deja activo el portafolio por defecto.
 *
 * El alta redirige a `/login`, pero con la confirmación por email desactivada
 * en local `signUp` ya devuelve sesión, así que el middleware rebota directo a
 * la app. El login explícito se ejercita en el flujo 1.
 */
async function entrarComoUsuarioNuevo(page: Page): Promise<string> {
  await sinDatosDeMercado(page);
  const email = `e2e-${randomUUID()}@ejemplo.test`;

  // Acá se localiza por `name`: la etiqueta de contraseña incluye el texto de
  // los requisitos, así que su nombre accesible no es "Contraseña" a secas.
  await page.goto("/signup");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirmPassword"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await elegirPortafolioPorDefecto(page);
  return email;
}

/**
 * Espera a que la app haya cargado y elige un portafolio concreto: el selector
 * arranca en "Todos los portafolios", que no permite cargar saldos ni operar.
 */
async function elegirPortafolioPorDefecto(page: Page) {
  const selector = page.locator("header select");
  await expect(selector).toBeVisible({ timeout: 30000 });
  await selector.selectOption({ label: PORTAFOLIO_POR_DEFECTO });
}

/** Carga saldos iniciales en la cuenta indicada del portafolio activo. */
async function cargarSaldoInicial(page: Page, cuenta: string, monto: string) {
  await page.goto("/cuenta");
  await page.getByLabel(cuenta).fill(monto);
  await page.getByRole("button", { name: "Guardar saldos iniciales" }).click();
  await expect(page.getByRole("button", { name: "Editar saldos" })).toBeVisible();
}

/** Da de alta una operación de acciones desde el formulario. */
async function abrirOperacionDeAcciones(
  page: Page,
  { activo, precio, cantidad }: { activo: string; precio: string; cantidad: string }
) {
  // Con un portafolio concreto activo en el header, el formulario no pide
  // destino: lo toma de ahí.
  await page.goto("/nueva-operacion");
  await page.getByLabel("Activo", { exact: true }).fill(activo);
  await page.getByLabel("Cantidad de acciones").fill(cantidad);
  await page.getByLabel(/^Precio de entrada/).fill(precio);
  await page.getByRole("button", { name: "Guardar operación" }).click();
}

/**
 * Primer elemento VISIBLE con ese texto. Hace falta porque varias pantallas
 * renderizan el mismo dato dos veces (tabla en desktop y tarjetas en mobile,
 * una de las dos oculta por CSS) y porque los `<option>` de los selectores
 * cuentan como texto de la página.
 */
function textoVisible(page: Page, texto: string | RegExp): Locator {
  return page.getByText(texto).filter({ visible: true }).first();
}

/**
 * Campo del modal de cierre. Sus `<label>` no tienen `for` ni envuelven al
 * input, así que `getByLabel` no los alcanza: se busca el input hermano.
 */
function campoDelModal(page: Page, etiqueta: string | RegExp): Locator {
  return page
    .locator("div")
    .filter({ has: page.getByText(etiqueta) })
    .last()
    .locator("input")
    .first();
}

test("1. registro, login y aterrizaje en la app con el portafolio por defecto", async ({
  page,
}) => {
  const email = await entrarComoUsuarioNuevo(page);

  // Cerrar sesión y volver a entrar: es el login de verdad, con credenciales.
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });

  // El usuario nuevo arranca con su portafolio por defecto ya creado.
  await page.goto("/cuenta");
  await expect(textoVisible(page, PORTAFOLIO_POR_DEFECTO)).toBeVisible();
});

test("2. cargar saldo y abrir una operación descuenta el costo exacto", async ({ page }) => {
  await entrarComoUsuarioNuevo(page);
  await cargarSaldoInicial(page, "Dólares (USD)", "10000");
  await expect(textoVisible(page, /US\$\s*10\.000,00/)).toBeVisible();

  await abrirOperacionDeAcciones(page, { activo: "AAPL", precio: "100", cantidad: "10" });
  await expect(textoVisible(page, /Operación guardada correctamente/)).toBeVisible();

  await page.goto("/cuenta");
  // 10.000 - (10 x 100) = 9.000 disponible.
  await expect(textoVisible(page, /US\$\s*9\.000,00/)).toBeVisible();
  await expect(textoVisible(page, "Apertura de operación")).toBeVisible();
});

test("3. cierre parcial acredita solo la porción y deja la posición abierta", async ({
  page,
}) => {
  await entrarComoUsuarioNuevo(page);
  await cargarSaldoInicial(page, "Dólares (USD)", "10000");
  await abrirOperacionDeAcciones(page, { activo: "AAPL", precio: "100", cantidad: "10" });
  await expect(textoVisible(page, /Operación guardada correctamente/)).toBeVisible();

  await page.goto("/posiciones-abiertas");
  await page
    .getByRole("button", { name: "Cerrar", exact: true })
    .filter({ visible: true })
    .first()
    .click();

  await campoDelModal(page, /^Cantidad a cerrar/).fill("4");
  await campoDelModal(page, "Precio de salida").fill("120");
  await page.getByRole("button", { name: "Confirmar cierre" }).click();

  // Quedan 6 unidades abiertas: la posición sigue en la lista.
  await expect(page.getByRole("button", { name: "Confirmar cierre" })).toBeHidden();
  await expect(textoVisible(page, "AAPL")).toBeVisible();

  await page.goto("/cuenta");
  // 9.000 + (400 de costo devuelto + 80 de P&L) = 9.480.
  await expect(textoVisible(page, /US\$\s*9\.480,00/)).toBeVisible();
});

test("4. abrir sin fondos muestra el aviso y no escribe nada", async ({ page }) => {
  await entrarComoUsuarioNuevo(page);

  await abrirOperacionDeAcciones(page, { activo: "AAPL", precio: "100", cantidad: "10" });

  await expect(textoVisible(page, /Faltan USD en tu cuenta en dólares/)).toBeVisible();

  await page.goto("/posiciones-abiertas");
  await expect(page.getByText("AAPL")).toHaveCount(0);
});

test("5. el importador marca los duplicados en el preview", async ({ page }) => {
  await entrarComoUsuarioNuevo(page);

  await page.goto("/historial");
  await page.getByRole("button", { name: "Exportar/importar operaciones" }).click();
  await page
    .getByLabel("Plataforma de origen")
    .selectOption({ label: "Formato propio (re-importar export del diario)" });

  // Archivo del formato propio (columnas de EXPORT_HEADERS) con la misma
  // operación repetida dos veces.
  const csv = [
    "Fecha entrada,Fecha salida,Activo,Tipo activo,Sub tipo,Divisa,Operación,Cantidad,Precio entrada,Precio salida,Estado",
    "2026-07-01,2026-07-05,AAPL,acciones,usd,USD,long,10,100,120,cerrada",
    "2026-07-01,2026-07-05,AAPL,acciones,usd,USD,long,10,100,120,cerrada",
  ].join("\n");

  await page.setInputFiles("#archivo", {
    name: "propio.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });

  await expect(textoVisible(page, /1 nuevas, 1 duplicadas \(destildadas\)/)).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByText("Duplicado")).toHaveCount(1);

  // La primera casilla es la de "seleccionar todo"; después va una por fila.
  const casillas = page.getByRole("checkbox");
  await expect(casillas.nth(1)).toBeChecked();
  await expect(casillas.nth(2)).not.toBeChecked();
});
