import React from "react";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, CalendarClock, Target, Phone, ThumbsUp, Flame } from "lucide-react";
import { Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ScoreBadge } from "@/components/score-badge";
import { ActionQueue } from "@/components/action-queue";

export default function Dashboard() {
  const { data: summary, isLoading, isError } = useGetDashboardSummary({
    query: {
      queryKey: getGetDashboardSummaryQueryKey()
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[60px]" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="p-8 text-center bg-destructive/10 rounded-lg text-destructive">
        <h2 className="text-xl font-bold mb-2">Error loading dashboard</h2>
        <p>Could not fetch the latest pipeline data.</p>
      </div>
    );
  }

  const statCards = [
    { title: "Total Pipeline", value: summary.totalLeads ?? 0, icon: Users, color: "text-blue-500" },
    { title: "Overdue Follow-ups", value: summary.followUpsDueToday ?? 0, icon: CalendarClock, color: "text-amber-500" },
    { title: "Conversion Rate", value: `${(summary.conversionRate ?? 0).toFixed(1)}%`, icon: Target, color: "text-emerald-500" },
    { title: "New This Month", value: summary.newLeads ?? 0, icon: TrendingUp, color: "text-purple-500" },
  ];

  const breakdownCards = [
    { label: "New", count: summary.newLeads, icon: Users, bg: "bg-sky-500/20 text-sky-300" },
    { label: "Contacted", count: summary.contactedLeads, icon: Phone, bg: "bg-amber-500/20 text-amber-300" },
    { label: "Interested", count: summary.interestedLeads, icon: ThumbsUp, bg: "bg-violet-500/20 text-violet-300" },
    { label: "Won", count: summary.wonLeads, icon: Target, bg: "bg-emerald-500/20 text-emerald-300" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1 text-lg">Your live lead pipeline and performance metrics.</p>
      </div>

      <ActionQueue />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <Card key={i} className="hover-elevate transition-all border-none shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="col-span-1 lg:col-span-2 space-y-8">
          <Card className="border-none shadow-md">
            <CardHeader>
              <CardTitle className="text-xl">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.recentLeads.length > 0 ? (
                <div className="space-y-4">
                  {summary.recentLeads.map((lead) => (
                    <Link key={lead.id} href={`/leads/${lead.id}`}>
                      <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors cursor-pointer group">
                        <div>
                          <p className="font-semibold group-hover:text-primary transition-colors">{lead.name}</p>
                          <p className="text-sm text-muted-foreground">Visited: {format(new Date(lead.visitDate), "MMM d, yyyy")}</p>
                        </div>
                        <StatusBadge status={lead.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center p-8 border border-dashed rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">No recent leads found.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-3 bg-secondary/30 border-b">
              <CardTitle className="text-xl flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                Hot Leads
              </CardTitle>
              <span className="text-xs text-muted-foreground">Top 5 by score, active only</span>
            </CardHeader>
            <CardContent className="pt-4">
              {(summary.hotLeads ?? []).length > 0 ? (
                <div className="space-y-3">
                  {(summary.hotLeads ?? []).map((lead) => (
                    <Link key={lead.id} href={`/leads/${lead.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 hover:bg-secondary/50 transition-colors cursor-pointer group">
                        <div className="flex items-center gap-3">
                          <ScoreBadge score={lead.score ?? 0} size="md" />
                          <div>
                            <p className="font-semibold text-sm group-hover:text-primary transition-colors">{lead.name}</p>
                            <p className="text-xs text-muted-foreground">Visited {format(new Date(lead.visitDate), "MMM d")}</p>
                          </div>
                        </div>
                        <StatusBadge status={lead.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center p-6 border border-dashed rounded-lg bg-muted/50">
                  <p className="text-muted-foreground text-sm">No active leads yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-1">
          <Card className="h-full border-none shadow-md bg-primary text-primary-foreground">
            <CardHeader>
              <CardTitle className="text-xl text-primary-foreground">Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {breakdownCards.map((b, i) => (
                  <div key={i} className="flex items-center justify-between bg-primary-foreground/10 p-4 rounded-lg backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${b.bg}`}>
                        <b.icon className="w-4 h-4" />
                      </div>
                      <span className="font-medium">{b.label}</span>
                    </div>
                    <span className="text-xl font-bold">{b.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
