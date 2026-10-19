import { Check } from "lucide-react";
import { ROLES, ROLE_ACCESS, ROLE_LABEL, permissionsFor } from "@/services/access";

/**
 * What each role can do, side by side, for the admin deciding which role to
 * give someone. The cells come from the same permission objects the screens
 * use, so the chart and the app agree.
 *
 * From sm up each line reads label, then the four roles. On a phone the card
 * is too narrow for that - the labels squeeze to a word a line - so the label
 * sits on its own row above its four answers.
 */
export default function RoleChart() {
  return (
    <table className="w-full table-fixed text-[11px] font-body border-collapse">
      <thead>
        <tr>
          <th scope="col" className="hidden sm:table-cell"><span className="sr-only">Can they</span></th>
          {ROLES.map((role) => (
            <th
              key={role}
              scope="col"
              className="w-1/4 sm:w-14 pb-1.5 align-bottom text-center text-[9px] font-display font-bold uppercase leading-tight text-surface-muted"
            >
              {ROLE_LABEL[role]}
            </th>
          ))}
        </tr>
      </thead>
      {ROLE_ACCESS.map((row) => (
        <tbody key={row.label} className="border-t border-surface-border">
          <tr className="sm:hidden">
            <th scope="rowgroup" colSpan={ROLES.length} className="pt-1.5 text-left font-normal leading-snug">
              {row.label}
            </th>
          </tr>
          <tr>
            <th scope="row" className="hidden sm:table-cell py-1.5 pr-2 text-left font-normal leading-snug">
              {row.label}
            </th>
            {ROLES.map((role) => {
              const cell = row.cell(permissionsFor(role));
              return (
                <td key={role} className="px-0.5 py-1.5 text-center align-middle leading-tight">
                  {cell === true ? (
                    <Check className="w-3.5 h-3.5 mx-auto text-emerald-400" aria-label="Yes" />
                  ) : cell === false ? (
                    <span className="text-surface-muted/50" aria-label="No">–</span>
                  ) : (
                    <span className="text-[10px] text-surface-muted">{cell}</span>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      ))}
    </table>
  );
}
