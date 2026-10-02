import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calcularRegistros, carregarFeriados } from "../_shared/calendario-fiscal.ts";

// Calcula o calendário do mês pelas REGRAS do catálogo (botão "Calcular Calendário").
// Desde 02/10/2026 a planilha oficial da Receita é soberana (função agenda-receita): linhas com fonte = 'receita'
// NÃO são recalculadas aqui, senão a regra sobrescreveria a data oficial.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const year = parseInt(body.year);
    const month = parseInt(body.month);
    const includeAnnual = body.includeAnnual === true;

    if (!year || !month || month < 1 || month > 12) {
      return new Response(
        JSON.stringify({ error: "year (YYYY) and month (1-12) are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const holidaySet = await carregarFeriados(supabase, year, month);

    const { data: obligations, error: oErr } = await supabase
      .from("fiscal_obligations_catalog")
      .select("*")
      .eq("active", true);
    if (oErr) throw oErr;

    const { records, skipped } = calcularRegistros(obligations || [], holidaySet, year, month, includeAnnual);

    // Linhas já fixadas pela planilha oficial ficam como estão.
    const { data: oficiais, error: fErr } = await supabase
      .from("fiscal_calendar")
      .select("obligation_id")
      .eq("year", year)
      .eq("month", month)
      .eq("fonte", "receita");
    if (fErr) throw fErr;
    const doOficial = new Set((oficiais || []).map((r: { obligation_id: string }) => r.obligation_id));
    const aGravar = records.filter((r) => !doOficial.has(r.obligation_id));
    for (const r of records) if (doOficial.has(r.obligation_id)) skipped.push(`${r.obligation_id} (data oficial da Receita, mantida)`);

    const { data: upserted, error: uErr } = await supabase
      .from("fiscal_calendar")
      .upsert(aGravar, { onConflict: "obligation_id,year,month", ignoreDuplicates: false })
      .select("id");
    if (uErr) throw uErr;

    return new Response(
      JSON.stringify({
        success: true,
        period: `${year}-${String(month).padStart(2, "0")}`,
        records_calculated: records.length,
        records_upserted: upserted?.length ?? 0,
        kept_official: doOficial.size,
        skipped_count: skipped.length,
        skipped,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
