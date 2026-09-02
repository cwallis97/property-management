import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import SectionSpinner from "../components/SectionSpinner";
import SearchResultRow from "../components/SearchResultRow";
import { IconSearch, IconAlertTriangle } from "../components/icons";
import { globalSearch } from "../utils/api";
import { searchResultTarget } from "../utils/searchResultTarget";

const STANDARD_TABS = ["all", "property", "location", "work_order", "asset", "vendor", "document"];
const TAB_LABEL = {
  all: "All",
  property: "Properties",
  location: "Locations",
  work_order: "Work Orders",
  asset: "Assets",
  vendor: "Vendors",
  document: "Documents",
  user: "People",
};
const PAGE_SIZE = 20;

export default function SearchResults() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const q = (params.get("q") || "").trim();
  const rawType = params.get("type");
  const activeTab = rawType && (STANDARD_TABS.includes(rawType) || rawType === "user") ? rawType : "all";

  // Overview: the ranked cross-type list for the "All" tab, and the counts
  // that drive the tab bar. Re-fetched only when the query text changes.
  const [overview, setOverview] = useState({ results: [], counts: {}, hasMore: false });
  const [overviewStatus, setOverviewStatus] = useState("idle"); // idle | loading | ready | error

  // Per-type paginated list for a specific tab.
  const [rows, setRows] = useState([]);
  const [rowsHasMore, setRowsHasMore] = useState(false);
  const [rowsStatus, setRowsStatus] = useState("idle");
  const [offset, setOffset] = useState(0);

  const overviewSeq = useRef(0);
  const rowsSeq = useRef(0);

  useEffect(() => {
    if (q.length < 2) {
      setOverview({ results: [], counts: {}, hasMore: false });
      setOverviewStatus("idle");
      return;
    }
    const seq = ++overviewSeq.current;
    setOverviewStatus("loading");
    globalSearch({ q, limit: 40 })
      .then((res) => {
        if (seq !== overviewSeq.current) return;
        setOverview({ results: res.results, counts: res.counts || {}, hasMore: res.hasMore });
        setOverviewStatus("ready");
      })
      .catch(() => {
        if (seq === overviewSeq.current) setOverviewStatus("error");
      });
  }, [q]);

  // Reset pagination whenever the tab or query changes.
  useEffect(() => {
    setRows([]);
    setOffset(0);
    setRowsHasMore(false);
    setRowsStatus(activeTab === "all" ? "idle" : "loading");
  }, [activeTab, q]);

  useEffect(() => {
    if (activeTab === "all" || q.length < 2) return;
    const seq = ++rowsSeq.current;
    setRowsStatus(offset === 0 ? "loading" : "loading-more");
    globalSearch({ q, type: activeTab, limit: PAGE_SIZE, offset })
      .then((res) => {
        if (seq !== rowsSeq.current) return;
        setRows((prev) => (offset === 0 ? res.results : [...prev, ...res.results]));
        setRowsHasMore(res.hasMore);
        setRowsStatus("ready");
      })
      .catch(() => {
        if (seq === rowsSeq.current) setRowsStatus("error");
      });
  }, [activeTab, q, offset]);

  function setTab(tab) {
    const next = new URLSearchParams(params);
    if (tab === "all") next.delete("type");
    else next.set("type", tab);
    setParams(next, { replace: true });
  }

  function open(result) {
    const target = searchResultTarget(result);
    if (target.run) target.run();
    else navigate(target.to, target.state ? { state: target.state } : undefined);
  }

  const tabs = [...STANDARD_TABS];
  if ("user" in overview.counts) tabs.push("user");

  const countLabel = (tab) => {
    if (tab === "all") return null;
    const n = overview.counts[tab];
    if (n === undefined) return null;
    return n >= 25 ? "25+" : String(n);
  };

  const listForActiveTab = activeTab === "all" ? overview.results : rows;

  return (
    <div>
      <PageHeader title={q ? `Search results for “${q}”` : "Search"} />

      {q.length < 2 ? (
        <EmptyState icon={IconSearch} title="Search PropertyOS" description="Type at least two characters to search across every property you can access." />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-x-5 gap-y-1 border-b border-line">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setTab(tab)}
                className={`border-b-2 pb-3 text-sm font-medium transition ${
                  activeTab === tab ? "border-accent text-ink" : "border-transparent text-ink-secondary hover:text-ink-secondary"
                }`}
              >
                {TAB_LABEL[tab]}
                {countLabel(tab) !== null && (
                  <span className="ml-1.5 rounded-full bg-surface-subtle px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
                    {countLabel(tab)}
                  </span>
                )}
              </button>
            ))}
          </div>

          {overviewStatus === "loading" && activeTab === "all" && <SectionSpinner />}
          {overviewStatus === "error" && (
            <EmptyState icon={IconAlertTriangle} title="Couldn't run that search" description="Something went wrong. Please try again." />
          )}

          {rowsStatus === "loading" && activeTab !== "all" && <SectionSpinner />}
          {rowsStatus === "error" && activeTab !== "all" && (
            <EmptyState icon={IconAlertTriangle} title="Couldn't load results" description="Something went wrong. Please try again." />
          )}

          {((activeTab === "all" && overviewStatus === "ready") ||
            (activeTab !== "all" && (rowsStatus === "ready" || rowsStatus === "loading-more"))) && (
            <>
              {listForActiveTab.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
                  <p className="text-sm text-ink">No matches for “{q}”{activeTab !== "all" ? ` in ${TAB_LABEL[activeTab]}` : ""}</p>
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Try checking the spelling, using fewer words, or searching by Property, Location, Work Order, Asset, Vendor, or Document name.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                  {listForActiveTab.map((result) => (
                    <SearchResultRow key={`${result.type}-${result.id}`} result={result} query={q} onSelect={open} dense={false} />
                  ))}
                </div>
              )}

              {activeTab !== "all" && rowsHasMore && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    disabled={rowsStatus === "loading-more"}
                    onClick={() => setOffset((o) => o + PAGE_SIZE)}
                    className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle disabled:opacity-50"
                  >
                    {rowsStatus === "loading-more" ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}

              {activeTab === "all" && overview.hasMore && (
                <p className="mt-4 text-center text-xs text-ink-muted">Showing the top matches — open a tab above to page through one type.</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
