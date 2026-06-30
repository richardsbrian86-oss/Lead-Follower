import React, { useState } from "react";
import { useListLeads, getListLeadsQueryKey, LeadStatus } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Search, Filter, Phone, Mail, Clock, Eye, ArrowUpDown } from "lucide-react";
import { ScoreBadge } from "@/components/score-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, statusConfig } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";

type SortDir = "asc" | "desc";

export default function LeadsList() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [scoreSort, setScoreSort] = useState<SortDir>("desc");

  const queryParams = {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
  };

  const { data: rawLeads, isLoading } = useListLeads(queryParams, {
    query: {
      queryKey: getListLeadsQueryKey(queryParams)
    }
  });

  const leads = rawLeads
    ? [...rawLeads].sort((a, b) =>
        scoreSort === "desc" ? (b.score ?? 0) - (a.score ?? 0) : (a.score ?? 0) - (b.score ?? 0)
      )
    : rawLeads;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Leads Pipeline</h1>
          <p className="text-muted-foreground mt-1">Manage and track your prospective members.</p>
        </div>
        <Button asChild size="lg" className="shadow-md">
          <Link href="/leads/new">Add New Lead</Link>
        </Button>
      </div>

      <Card className="border-none shadow-md overflow-hidden">
        <div className="p-4 bg-secondary/30 border-b flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search by name or email..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              value={statusFilter}
              onValueChange={(val) => setStatusFilter(val as LeadStatus | "all")}
            >
              <SelectTrigger className="bg-background">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(statusConfig).map(([key, conf]) => (
                  <SelectItem key={key} value={key}>
                    {conf.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="font-semibold text-foreground">Name</TableHead>
                <TableHead className="font-semibold text-foreground">Contact Info</TableHead>
                <TableHead className="font-semibold text-foreground">Visit Date</TableHead>
                <TableHead className="font-semibold text-foreground">Status</TableHead>
                <TableHead className="font-semibold text-foreground">
                  <button
                    onClick={() => setScoreSort(s => s === "desc" ? "asc" : "desc")}
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    Score
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </button>
                </TableHead>
                <TableHead className="text-right font-semibold text-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-10 rounded-md" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : leads?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No leads found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                leads?.map((lead) => (
                  <TableRow key={lead.id} className="hover:bg-secondary/20 transition-colors group">
                    <TableCell className="font-semibold">{lead.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="w-3.5 h-3.5" />
                          <a href={`mailto:${lead.email}`} className="hover:text-primary transition-colors">{lead.email}</a>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="w-3.5 h-3.5" />
                          <a href={`tel:${lead.phone}`} className="hover:text-primary transition-colors">{lead.phone}</a>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        {format(new Date(lead.visitDate), "MMM d, yyyy")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    <TableCell>
                      <ScoreBadge score={lead.score ?? 0} size="sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/leads/${lead.id}`}>
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
