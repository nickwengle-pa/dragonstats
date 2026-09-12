import { useNavigate } from "react-router-dom";
import { SeasonReportDocument } from "./SeasonReportScreen";
import type { ReportSection } from "@/services/seasonReport";

const sections: ReportSection[] = [
  { title: "Game results", headers: ["Date","Opponent","Site","W/L","PF","PA"], rows: [["2026-08-28","River Valley","Home","W",28,14],["2026-09-04","West Branch","Away","W",21,7],["2026-09-11","Northern Cambria","Home","L",14,20]] },
  { title: "Team totals", headers: ["Statistic","PL","Opponents"], rows: [["Points",63,41],["First downs",42,31],["Rushing attempts",98,85],["Rushing yards",438,292],["Passing yards",362,278],["Total offense",800,570],["Yards per play","5.1","4.0"],["Third-down conversions","14–32","9–30"],["Turnovers",3,6],["Penalties: Number–Yards","12–95","15–120"]] },
  { title: "Rushing · Loss excludes sacks; Sack = yards lost", headers: ["Player","Att","Net","Gain","Loss","Sack","TD","Lg","Avg","Fum"], rows: [["Quarterback #7",24,76,110,-13,-21,1,21,"3.2",1],["Running back #21",44,228,250,-22,0,3,42,"5.2",0],["Running back #2",28,136,145,-9,0,1,28,"4.9",1],["TEAM",2,-2,0,-2,0,0,0,"-1.0",0]], total: ["Total",98,438,505,-46,-21,5,42,"4.5",2] },
  { title: "Passing", headers: ["Player","Att","Comp","Yds","TD","Int","Sack","Lg"], rows: [["Quarterback #7",58,34,362,3,1,4,39]], total: ["Total",58,34,362,3,1,4,39] },
  { title: "Receiving", headers: ["Player","Rec","Yds","TD","Lg"], rows: [["Receiver #11",16,198,2,39],["Receiver #8",12,124,1,28],["Running back #21",6,40,0,12]], total: ["Total",34,362,3,39] },
  { title: "Defense", headers: ["Player","Solo","Ast","Total","TFL","Sack","Int","FF","FR","PBU"], rows: [["Linebacker #55",14,10,19,4,2,0,1,1,0],["Linebacker #44",12,8,16,3,1,0,1,0,1],["Defensive back #3",10,6,13,1,0,2,0,1,3],["Defensive back #5",8,4,10,0,0,1,0,0,2]], total: ["Total",44,28,58,8,3,3,2,2,6] },
  { title: "Punting", headers: ["Player","No","Yds","Avg","Lg","In 20","TB"], rows: [["Punter #7",9,306,"34.0",45,3,1]], total: ["Total",9,306,"34.0",45,3,1] },
  { title: "Kickoffs", headers: ["Player","No","Yds","Avg","TB"], rows: [["Kicker #10",12,576,"48.0",2]], total: ["Total",12,576,"48.0",2] },
  { title: "Field goals & extra points", headers: ["Player","FG Made","FG Att","FG Lg","PAT Made","PAT Att"], rows: [["Kicker #10",0,1,0,9,9]], total: ["Total",0,1,0,9,9] },
  { title: "Kickoff returns", headers: ["Player","No","Yds","Lg","TD"], rows: [["Returner #2",5,178,92,1],["Returner #21",2,36,22,0]], total: ["Total",7,214,92,1] },
  { title: "Punt returns", headers: ["Player","No","Yds","Lg","TD"], rows: [["Returner #2",3,28,18,0]], total: ["Total",3,28,18,0] },
  { title: "Interception returns", headers: ["Player","No","Yds","Lg","TD"], rows: [["Defensive back #3",2,24,18,0],["Defensive back #5",1,8,8,0]], total: ["Total",3,32,18,0] },
  { title: "Scoring", headers: ["Player","Points"], rows: [["Running back #21",18],["Receiver #11",12],["Kicker #10",9],["Quarterback #7",6],["Running back #2",12],["Receiver #8",6]], total: ["Total",63] },
];
const program = { name: "Purchase Line High School", abbreviation: "PL", logo_url: null };
export default function SeasonReportPreview() {
  const navigate = useNavigate();
  return <SeasonReportDocument program={program} title="2026 Varsity" sections={sections} record="2–1 · 3 completed games" preview onBack={() => navigate("/flow-preview")} />;
}

