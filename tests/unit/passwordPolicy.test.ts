import { describe, expect, test } from "vitest";
import {
  requisitosPasswordFaltantes,
  validarPassword,
} from "@/utils/passwordPolicy";

describe("requisitosPasswordFaltantes", () => {
  test("una contraseña que cumple todo no tiene faltantes", () => {
    expect(requisitosPasswordFaltantes("Abcdef1!")).toEqual([]);
  });

  test.each([
    ["Abc1!", "al menos 8 caracteres"],
    ["ABCDEF1!", "una minúscula"],
    ["abcdef1!", "una mayúscula"],
    ["Abcdefg!", "un número"],
    ["Abcdefg1", "un carácter especial"],
  ])("%s reporta que falta %s", (password, faltante) => {
    expect(requisitosPasswordFaltantes(password)).toContain(faltante);
  });

  test("una contraseña vacía reporta los cinco requisitos", () => {
    expect(requisitosPasswordFaltantes("")).toHaveLength(5);
  });
});

describe("validarPassword", () => {
  test("devuelve null cuando la contraseña cumple", () => {
    expect(validarPassword("Abcdef1!")).toBeNull();
  });

  test("devuelve un mensaje en registro formal cuando no cumple", () => {
    expect(validarPassword("abc")).toMatch(/^La contraseña debe tener /);
  });
});
