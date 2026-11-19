"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Sem as variáveis de ambiente o app roda em modo demonstração (dados de exemplo). */
export const modoReal = Boolean(url && key);
export const supabase: SupabaseClient | null = modoReal ? createClient(url!, key!) : null;
export const SUPABASE_URL = url ?? "";
