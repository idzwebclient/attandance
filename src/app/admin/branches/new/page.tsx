import type { Metadata } from "next";
import { ActionForm } from "@/components/form-state";
import { Card, PageTitle } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { createBranch } from "../../actions";
import { BranchFields } from "../branch-fields";

export const metadata: Metadata = { title: "Cawangan baharu" };

export default async function NewBranch() {
  const { supabase } = await requireRole("admin");
  const settings = await getSettings(supabase);
  return (
    <div className="max-w-2xl">
      <PageTitle title="Cawangan baharu" />
      <Card>
        <ActionForm action={createBranch} submitLabel="Cipta cawangan">
          <BranchFields defaultRadius={settings.default_radius_meters} />
        </ActionForm>
      </Card>
    </div>
  );
}
