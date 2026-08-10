import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { storage } from "./storageAdapter";
import {
  Plus, MessageCircle, ChevronDown, ChevronUp, CheckCircle2, Circle, Users,
  FolderKanban, Rss, X, AlertTriangle, RotateCcw, ShieldCheck, LogOut,
  UserCheck, UserX, Trash2, Lock, UserPlus, Calendar, GripVertical, Pencil, Upload, Download, ListTodo, Home, Image as ImageIcon,
} from "lucide-react";
import * as XLSX from "xlsx";

/* ============================================================
   STORAGE LAYER (unchanged from before: one small key per domain,
   timeout + safe-parse loads, never an infinite spinner)
   ============================================================ */

const KEYS = {
  posts: "jtm-v2-posts",
  projects: "jtm-v2-projects",
  tasks: "jtm-v2-tasks",
  teams: "jtm-v2-teams",
  users: "jtm-v2-users",
  announcements: "jtm-v2-announcements",
  weeklyTasks: "jtm-v2-weekly-tasks",
  dailyTasks: "jtm-v2-daily-tasks",
  homeImage: "jtm-v2-home-image",
  notifications: "jtm-v2-notifications",
};

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function pushNotification(updateNotifications, recipientUserId, type, message) {
  if (!recipientUserId || !updateNotifications) return;
  updateNotifications((prev) => [
    ...prev,
    {
      id: "notif_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      userId: recipientUserId,
      type,
      message,
      ts: Date.now(),
    },
  ]);
}

function withTimeout(promise, ms = 6000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function safeLoad(key, fallback) {
  try {
    const res = await withTimeout(storage.get(key, false));
    if (!res || res.value == null) return { value: fallback, ok: true };
    try {
      return { value: JSON.parse(res.value), ok: true };
    } catch (parseErr) {
      return { value: fallback, ok: false, reason: "parse" };
    }
  } catch (e) {
    if (String(e.message || e).toLowerCase().includes("timeout")) {
      return { value: fallback, ok: false, reason: "timeout" };
    }
    return { value: fallback, ok: true };
  }
}

async function safeSave(key, value, attempt = 1) {
  try {
    const result = await withTimeout(storage.set(key, JSON.stringify(value)), 6000);
    if (!result) throw new Error("no result");
    return true;
  } catch (e) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 400 * attempt + Math.random() * 200));
      return safeSave(key, value, attempt + 1);
    }
    return false;
  }
}

async function resetKey(key) {
  try {
    await storage.delete(key, false);
    return true;
  } catch (e) {
    return false;
  }
}

function usePersisted(key, fallback) {
  const [value, setValue] = useState(fallback);
  const [status, setStatus] = useState("loading");
  const [warnReason, setWarnReason] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    safeLoad(key, fallback).then((r) => {
      if (cancelled) return;
      setValue(r.value);
      setStatus(r.ok ? "ok" : "warn");
      setWarnReason(r.reason || null);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const update = useCallback(
    (updater) => {
      setValue((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          safeSave(key, next);
        }, 250);
        return next;
      });
    },
    [key]
  );

  const clearAndReset = useCallback(async () => {
    await resetKey(key);
    setValue(fallback);
    setStatus("ok");
    setWarnReason(null);
  }, [key]);

  return { value, update, status, warnReason, clearAndReset };
}

/* ============================================================
   AUTH HELPERS (client-side hash for preview only -- the final
   Netlify-backed version moves this to the server with a real
   salted hash + signed session cookie)
   ============================================================ */

async function hashPassword(username, password) {
  const enc = new TextEncoder().encode(`jtm::${username}::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const JETEMA_LOGO = "data:image/png;base64,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";

const DEFAULT_TEAMS = ["1팀", "2팀"];
const DEFAULT_PROJECTS = [
  { id: "p1", name: "생체적합성 소재 평가", category: "연구개발", team: "1팀", accessUsers: [], assignee: "", dueDate: "" },
  { id: "p2", name: "임상 샘플 관리 체계 개선", category: "운영", team: "2팀", accessUsers: [], assignee: "", dueDate: "" },
];

/* ============================================================
   SMALL UI HELPERS
   ============================================================ */
function WarnBanner({ reason, onReset }) {
  const msg =
    reason === "timeout"
      ? "데이터를 불러오는 데 시간이 오래 걸려 빈 상태로 시작했어요."
      : "저장된 데이터 형식에 문제가 있어 빈 상태로 시작했어요.";
  return (
    <div className="warnBanner">
      <AlertTriangle size={15} />
      <span>{msg}</span>
      <button onClick={onReset} className="warnResetBtn">
        <RotateCcw size={12} /> 초기화
      </button>
    </div>
  );
}

function Avatar({ name }) {
  const initial = name ? name.trim().charAt(0) : "?";
  return <div className="avatar">{initial}</div>;
}

/* ============================================================
   LOGIN / SIGNUP SCREEN
   ============================================================ */
function AuthScreen({ users, updateUsers, teams, onLogin }) {
  const [stage, setStage] = useState("name"); // name | setPassword | enterPassword
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeUser, setActiveUser] = useState(null);

  const isFirstUserEver = users.length === 0;

  const resetToName = () => {
    setStage("name");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setInfo("");
    setActiveUser(null);
  };

  const submitName = () => {
    setError("");
    setInfo("");
    const trimmed = name.trim();
    if (!trimmed) {
      setError("이름을 입력해주세요.");
      return;
    }

    const existing = users.find((u) => u.name === trimmed);

    if (!existing) {
      const newUser = {
        id: "user_" + Date.now(),
        name: trimmed,
        passwordHash: null,
        role: isFirstUserEver ? "admin" : "member",
        status: isFirstUserEver ? "approved" : "pending",
        teams: isFirstUserEver ? teams.slice() : [],
        createdAt: Date.now(),
      };
      updateUsers((prev) => [...prev, newUser]);

      if (isFirstUserEver) {
        setActiveUser(newUser);
        setStage("setPassword");
        setInfo("첫 가입자는 자동으로 관리자 계정이 됩니다. 사용할 비밀번호를 설정해주세요.");
      } else {
        setInfo("가입 신청이 완료되었습니다. 관리자 승인 후 같은 이름으로 다시 로그인해주세요.");
        setName("");
      }
      return;
    }

    if (existing.status === "pending") {
      setError("아직 관리자 승인 대기 중인 계정입니다.");
      return;
    }
    if (existing.status === "rejected") {
      setError("가입이 거절된 계정입니다. 관리자에게 문의해주세요.");
      return;
    }

    setActiveUser(existing);
    setStage(existing.passwordHash ? "enterPassword" : "setPassword");
  };

  const submitSetPassword = async () => {
    setError("");
    if (!password || password.length < 4) {
      setError("비밀번호는 4자 이상 입력해주세요.");
      return;
    }
    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    const hash = await hashPassword(activeUser.name, password);
    setBusy(false);
    const updatedUser = { ...activeUser, passwordHash: hash };
    updateUsers((prev) => prev.map((u) => (u.id === activeUser.id ? updatedUser : u)));
    onLogin(updatedUser);
  };

  const submitEnterPassword = async () => {
    setError("");
    if (!password) {
      setError("비밀번호를 입력해주세요.");
      return;
    }
    setBusy(true);
    const hash = await hashPassword(activeUser.name, password);
    setBusy(false);
    if (hash !== activeUser.passwordHash) {
      setError("비밀번호가 올바르지 않습니다.");
      return;
    }
    onLogin(activeUser);
  };

  return (
    <div className="authWrap">
      <div className="authCard">
        <div className="authBrand">
          <img src={JETEMA_LOGO} alt="JETEMA" className="authLogoImg" />
          <span className="brandSub">Biomaterial Research Dept.</span>
        </div>

        {stage === "name" && (
          <>
            <p className="authHint">이름을 입력해주세요. 처음이면 관리자 승인 후 사용할 수 있어요.</p>
            <input
              autoFocus
              className="formInput"
              placeholder="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitName()}
            />
            {error && <div className="authError">{error}</div>}
            {info && <div className="authInfo">{info}</div>}
            <button className="btnPrimary full" disabled={busy} onClick={submitName}>
              Login
            </button>
          </>
        )}

        {stage === "setPassword" && (
          <>
            <p className="authHint">
              <strong>{activeUser?.name}</strong>님, 사용할 비밀번호를 설정해주세요.
            </p>
            {info && <div className="authInfo">{info}</div>}
            <input
              autoFocus
              className="formInput"
              placeholder="비밀번호 (4자 이상)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              className="formInput"
              placeholder="비밀번호 확인"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSetPassword()}
            />
            {error && <div className="authError">{error}</div>}
            <button className="btnPrimary full" disabled={busy} onClick={submitSetPassword}>
              비밀번호 설정하고 시작하기
            </button>
            <button className="authBackLink" onClick={resetToName}>
              다른 이름으로
            </button>
          </>
        )}

        {stage === "enterPassword" && (
          <>
            <p className="authHint">
              <strong>{activeUser?.name}</strong>님, 비밀번호를 입력해주세요.
            </p>
            <input
              autoFocus
              className="formInput"
              placeholder="비밀번호"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitEnterPassword()}
            />
            {error && <div className="authError">{error}</div>}
            <button className="btnPrimary full" disabled={busy} onClick={submitEnterPassword}>
              Login
            </button>
            <button className="authBackLink" onClick={resetToName}>
              다른 이름으로
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   ANNOUNCEMENTS PANEL (전체공지) -- visible in the feed regardless
   of team, anyone can post, authors can edit their own after
   posting. Defaults to showing the last 30 days, with a toggle
   to reveal the full history.
   ============================================================ */
function AnnouncementsPanel({ announcements, updateAnnouncements, currentUser, users, updateNotifications }) {
  const [draft, setDraft] = useState("");
  const [draftImportant, setDraftImportant] = useState(false);
  const [draftDate, setDraftDate] = useState(isoDate(new Date()));
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [editDate, setEditDate] = useState("");
  const [commentDraft, setCommentDraft] = useState({});
  const [openId, setOpenId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const sorted = [...announcements].sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.ts - a.ts);
  const cutoffDate = isoDate(new Date(Date.now() - ONE_MONTH_MS));
  const visible = showAll ? sorted : sorted.filter((a) => (a.date || isoDate(new Date(a.ts))) >= cutoffDate);
  const hiddenCount = sorted.length - visible.length;

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    updateAnnouncements((prev) => [
      {
        id: "ann_" + Date.now(),
        text,
        authorId: currentUser.id,
        author: currentUser.name,
        date: draftDate || isoDate(new Date()),
        ts: Date.now(),
        updatedAt: null,
        comments: [],
        important: draftImportant,
      },
      ...prev,
    ]);
    if (updateNotifications && users) {
      const preview = text.length > 40 ? text.slice(0, 40) + "..." : text;
      users
        .filter((u) => u.id !== currentUser.id)
        .forEach((u) => {
          pushNotification(updateNotifications, u.id, "announcement", `${currentUser.name}님이 새 공지를 등록했어요: ${preview}`);
        });
    }
    setDraft("");
    setDraftImportant(false);
    setDraftDate(isoDate(new Date()));
  };

  const toggleImportant = (id) => {
    updateAnnouncements((prev) =>
      prev.map((a) => (a.id === id ? { ...a, important: !a.important } : a))
    );
  };

  const startEdit = (a) => {
    setEditingId(a.id);
    setEditDraft(a.text);
    setEditDate(a.date || isoDate(new Date(a.ts)));
  };

  const saveEdit = (id) => {
    const text = editDraft.trim();
    if (!text) return;
    updateAnnouncements((prev) =>
      prev.map((a) => (a.id === id ? { ...a, text, date: editDate || a.date, updatedAt: Date.now() } : a))
    );
    setEditingId(null);
    setEditDraft("");
  };

  const deleteAnnouncement = (id) => {
    updateAnnouncements((prev) => prev.filter((a) => a.id !== id));
    setConfirmDeleteId(null);
    setOpenId((cur) => (cur === id ? null : cur));
  };

  const submitComment = (id) => {
    const text = (commentDraft[id] || "").trim();
    if (!text) return;
    updateAnnouncements((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              comments: [
                ...(a.comments || []),
                { id: "c_" + Date.now(), text, author: currentUser.name, ts: Date.now() },
              ],
            }
          : a
      )
    );
    setCommentDraft((d) => ({ ...d, [id]: "" }));
  };

  return (
    <div className="announcePanel">
      <div className="announceHeaderRow">
        <h3 className="paneTitle">
          <ShieldCheck size={15} /> 전체 공지
        </h3>
        {sorted.length > 0 && (
          <button className="btnGhost small" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "최근 1개월만 보기" : `전체보기 (이전 공지 ${hiddenCount}개)`}
          </button>
        )}
      </div>

      <div className="composer announceComposer">
        <div className="growWrap" data-value={draft}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="전체 팀에 공지할 내용을 남겨보세요"
            className="composerInput autoGrow"
            rows={2}
          />
        </div>
        <div className="announceComposerActions">
          <label className="importantCheck">
            <input
              type="checkbox"
              checked={draftImportant}
              onChange={(e) => setDraftImportant(e.target.checked)}
            />
            ★ 중요 공지로 등록
          </label>
          <input
            type="date"
            className="formInput announceDateInput"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
          />
          <button className="btnPrimary" onClick={submit} disabled={!draft.trim()}>
            공지 등록
          </button>
        </div>
      </div>

      {sorted.length === 0 && <p className="mutedText">등록된 공지가 없어요.</p>}
      {sorted.length > 0 && visible.length === 0 && (
        <p className="mutedText">최근 1개월 내 공지가 없어요. 전체보기로 이전 공지를 확인하세요.</p>
      )}

      <div className="announceList">
        {visible.map((a) => {
          const isOpen = openId === a.id;
          const shortDate = new Date(a.date || a.ts).toLocaleDateString("ko-KR", {
            month: "2-digit",
            day: "2-digit",
            weekday: "short",
          });
          const commentCount = (a.comments || []).length;

          return (
            <div className={"announceCard" + (a.important ? " important" : "")} key={a.id}>
              <button
                className="announceRow"
                onClick={() => setOpenId(isOpen ? null : a.id)}
              >
                {a.important && <span className="importantDot" title="중요 공지">★</span>}
                <span className="announceRowDate">
                  <Calendar size={11} />
                  {shortDate}
                </span>
                <span className="announceRowPreview">{a.text}</span>
                {commentCount > 0 && <span className="announceRowCommentCount">💬 {commentCount}</span>}
                <span className="announceRowToggle">
                  {isOpen ? "접기" : "열기"}
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {isOpen && (
                <div className="announceDetail">
                  <div className="postHeader">
                    <Avatar name={a.author} />
                    <div className="postMeta">
                      <span className="postAuthor">{a.author}</span>
                      <span className="announceDate">
                        <Calendar size={11} />
                        {new Date(a.date || a.ts).toLocaleDateString("ko-KR", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          weekday: "short",
                        })}
                        {a.updatedAt && <span className="editedTag"> · 수정됨</span>}
                      </span>
                    </div>
                    {a.authorId === currentUser.id && (
                      <button
                        className={"importantToggleBtn" + (a.important ? " on" : "")}
                        onClick={() => toggleImportant(a.id)}
                        title={a.important ? "중요 표시 해제" : "중요 표시"}
                      >
                        ★ 중요
                      </button>
                    )}
                    {a.authorId === currentUser.id && editingId !== a.id && (
                      <button className="iconBtn" onClick={() => startEdit(a)} title="수정">
                        수정
                      </button>
                    )}
                    {a.authorId === currentUser.id &&
                      (confirmDeleteId === a.id ? (
                        <div className="deleteConfirmRow">
                          <button className="btnDangerSmall" onClick={() => deleteAnnouncement(a.id)}>
                            삭제
                          </button>
                          <button className="btnGhost small" onClick={() => setConfirmDeleteId(null)}>
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          className="iconBtn danger"
                          onClick={() => setConfirmDeleteId(a.id)}
                          title="삭제"
                        >
                          <Trash2 size={15} />
                        </button>
                      ))}
                  </div>

                  {editingId === a.id ? (
                    <div className="editBox">
                      <AutoGrowTextarea
                        value={editDraft}
                        onCommit={setEditDraft}
                        className="composerInput autoGrow"
                        rows={2}
                      />
                      <input
                        type="date"
                        className="formInput announceDateInput"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                      />
                      <div className="editActions">
                        <button className="btnPrimary small" onClick={() => saveEdit(a.id)}>
                          저장
                        </button>
                        <button className="btnGhost small" onClick={() => setEditingId(null)}>
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="postText">{a.text}</div>
                  )}

                  <div className="commentSection">
                    {(a.comments || []).map((c) => (
                      <div className="commentRow" key={c.id}>
                        <Avatar name={c.author} />
                        <div>
                          <div className="commentMeta">
                            <span className="commentAuthor">{c.author}</span>
                            <span className="commentTime">{new Date(c.ts).toLocaleString("ko-KR")}</span>
                          </div>
                          <div className="commentText">{c.text}</div>
                        </div>
                      </div>
                    ))}
                    <div className="commentComposer">
                      <input
                        value={commentDraft[a.id] || ""}
                        onChange={(e) => setCommentDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && submitComment(a.id)}
                        placeholder="댓글 남기기"
                        className="commentInput"
                      />
                      <button className="btnGhost" onClick={() => submitComment(a.id)}>
                        <MessageCircle size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   FEED TAB
   ============================================================ */
function FeedTab({ announcements, updateAnnouncements, currentUser, users, updateNotifications }) {
  return (
    <div className="tabPane">
      <AnnouncementsPanel
        announcements={announcements}
        updateAnnouncements={updateAnnouncements}
        currentUser={currentUser}
        users={users}
        updateNotifications={updateNotifications}
      />
    </div>
  );
}

/* ============================================================
   PROJECTS TAB
   ============================================================ */
function ProjectsTab({
  projects,
  updateProjects,
  tasks,
  updateTasks,
  teams,
  users,
  currentUser,
  isAdmin,
  accessibleTeams,
  updateNotifications,
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [newTeam, setNewTeam] = useState(teams[0] || "");
  const [draggedId, setDraggedId] = useState(null);
  const [openProjectId, setOpenProjectId] = useState(null);

  // Let the real browser/mobile back button close the detail view instead
  // of leaving the app -- best effort, falls back gracefully if the
  // History API is unavailable in this environment.
  useEffect(() => {
    const handler = () => setOpenProjectId(null);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const openProjectDetail = (id) => {
    try {
      window.history.pushState({ jtmDetail: "project" }, "");
    } catch (e) {}
    setOpenProjectId(id);
  };

  const closeProjectDetail = () => {
    setOpenProjectId(null);
    try {
      if (window.history.state && window.history.state.jtmDetail === "project") {
        window.history.back();
      }
    } catch (e) {}
  };
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const CARD_COLORS = ["#087FBE", "#3976BA", "#FF6F4D", "#7E57C2", "#3E8E5B", "#C2872F"];
  const colorFor = (id) => {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % CARD_COLORS.length;
    return CARD_COLORS[h];
  };

  const canEnterProject = (p) => {
    if (p.accessUsers && p.accessUsers.length > 0) {
      return isAdmin || p.accessUsers.includes(currentUser.id);
    }
    return true;
  };

  const groups = [...teams, null].map((team) => ({
    team,
    label: team || "공통",
    items: projects.filter((p) => (p.team || null) === team),
  }));

  const addProject = () => {
    if (!name.trim()) return;
    updateProjects((prev) => [
      ...prev,
      {
        id: "proj_" + Date.now(),
        name: name.trim(),
        category: "",
        team: newTeam || null,
        accessUsers: [],
        assignee: "",
        dueDate: "",
        description: "",
      },
    ]);
    setName("");
    setShowForm(false);
  };

  const updateProject = (id, patch) => {
    updateProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const deleteProject = (id) => {
    updateProjects((prev) => prev.filter((p) => p.id !== id));
    setConfirmDeleteId(null);
    if (openProjectId === id) setOpenProjectId(null);
  };

  const handleDrop = (targetId) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    updateProjects((prev) => {
      const list = [...prev];
      const fromIdx = list.findIndex((p) => p.id === draggedId);
      const toIdx = list.findIndex((p) => p.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return list;
    });
    setDraggedId(null);
  };

  const taskStats = (projectId) => {
    const linked = tasks.filter((t) => t.projectId === projectId);
    return { done: linked.filter((t) => t.done).length, total: linked.length };
  };

  const openProject = projects.find((p) => p.id === openProjectId);

  if (openProject) {
    return (
      <ProjectDetailPage
        project={openProject}
        users={users}
        tasks={tasks.filter((t) => t.projectId === openProject.id)}
        updateTasks={updateTasks}
        onUpdate={(patch) => updateProject(openProject.id, patch)}
        onBack={closeProjectDetail}
        onDelete={() => {
          setOpenProjectId(null);
          deleteProject(openProject.id);
        }}
        currentUser={currentUser}
        updateNotifications={updateNotifications}
      />
    );
  }

  return (
    <div className="tabPane">
      <div className="paneHeaderRow">
        <h3 className="paneTitle">프로젝트</h3>
        <button className="btnPrimary small" onClick={() => setShowForm((s) => !s)}>
          <Plus size={14} /> 새 프로젝트
        </button>
      </div>

      {showForm && (
        <div className="inlineForm">
          <input
            placeholder="프로젝트명"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addProject()}
            className="formInput grow"
          />
          <select className="formSelect" value={newTeam} onChange={(e) => setNewTeam(e.target.value)}>
            <option value="">공통</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button className="btnPrimary small" onClick={addProject}>
            추가
          </button>
          <button className="btnGhost small" onClick={() => setShowForm(false)}>
            취소
          </button>
        </div>
      )}

      {projects.length === 0 && (
        <div className="emptyState">
          <FolderKanban size={22} />
          <p>등록된 프로젝트가 없어요.</p>
        </div>
      )}

      {groups.map(
        (g) =>
          (g.items.length > 0 || g.team === null) && (
            <div key={g.label} className="teamGroup">
              <div className="teamGroupHeader">
                <span>{g.label}</span>
                <span className="countBadge">{g.items.length}</span>
              </div>
              <div className="projCardGrid">
                {g.items.map((p) => {
                  const stats = taskStats(p.id);
                  const entryAllowed = canEnterProject(p);
                  return (
                    <div
                      key={p.id}
                      className={"projCard" + (entryAllowed ? "" : " locked")}
                      draggable={entryAllowed}
                      onDragStart={() => entryAllowed && setDraggedId(p.id)}
                      onDragOver={(e) => entryAllowed && e.preventDefault()}
                      onDrop={() => entryAllowed && handleDrop(p.id)}
                    >
                      <div className="projCardTop">
                        <GripVertical size={14} className="dragHandle" />
                        <select
                          className="projTeamBadge"
                          value={p.team || ""}
                          disabled={!entryAllowed}
                          onChange={(e) => updateProject(p.id, { team: e.target.value || null })}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">공통</option>
                          {teams.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        {entryAllowed && (
                          <>
                            <button
                              className="projIconBtn"
                              title="접근 권한 / 담당자"
                              onClick={() => openProjectDetail(p.id)}
                            >
                              <Users size={14} />
                            </button>
                            <button
                              className="projIconBtn"
                              title="수정"
                              onClick={() => openProjectDetail(p.id)}
                            >
                              <Pencil size={14} />
                            </button>
                            {confirmDeleteId === p.id ? (
                              <div className="projDeleteConfirm" onClick={(e) => e.stopPropagation()}>
                                <button className="btnDangerSmall" onClick={() => deleteProject(p.id)}>
                                  삭제
                                </button>
                                <button className="btnGhost small" onClick={() => setConfirmDeleteId(null)}>
                                  취소
                                </button>
                              </div>
                            ) : (
                              <button
                                className="projIconBtn danger"
                                title="삭제"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(p.id);
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      <div
                        className="projCardBody"
                        onClick={() => entryAllowed && openProjectDetail(p.id)}
                        style={{ cursor: entryAllowed ? "pointer" : "not-allowed" }}
                      >
                        <span className="projColorDot" style={{ background: colorFor(p.id) }} />
                        <div className="projCardTitle">{p.name}</div>
                        {entryAllowed ? (
                          <div className="projCardMeta">
                            {stats.total > 0 ? `${stats.done} / ${stats.total}건 완료` : "등록된 업무 없음"}
                          </div>
                        ) : (
                          <div className="projAccessTag">
                            <Lock size={10} /> 접근 권한이 없어요
                          </div>
                        )}
                        {entryAllowed && (p.assignee || p.dueDate) && (
                          <div className="projCardAssignee">
                            <Calendar size={11} />
                            {p.assignee}
                            {p.assignee && p.dueDate && " · "}
                            {p.dueDate}
                          </div>
                        )}
                        {entryAllowed && p.accessUsers && p.accessUsers.length > 0 && (
                          <div className="projAccessTag">
                            <Lock size={10} /> {p.accessUsers.length}명만 접근 가능
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                <button className="projCard projCardAdd" onClick={() => setShowForm(true)}>
                  <Plus size={20} />
                  <span>새 프로젝트</span>
                </button>
              </div>
            </div>
          )
      )}
    </div>
  );
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

function autoResize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

// Controlled auto-growing textarea. Height is recalculated with
// useLayoutEffect on every value change (including the very first render),
// so it never depends on ref-callback/font-load timing quirks -- the box
// is always the right height for whatever text is actually in it.
// Compact multi-select for assigning several people to one task. Click the
// button to open a checkbox list; click outside to close.
function MultiAssigneeSelect({ users, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (name) => {
    const has = selected.includes(name);
    onChange(has ? selected.filter((n) => n !== name) : [...selected, name]);
  };

  const label =
    selected.length === 0
      ? "미배정"
      : selected.length <= 2
      ? selected.join(", ")
      : `${selected[0]} 외 ${selected.length - 1}명`;

  return (
    <div className="assigneeSelectWrap" ref={wrapRef}>
      <button
        type="button"
        className="formSelect assigneeSelectBtn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {label}
      </button>
      {open && (
        <div className="assigneeDropdown" onClick={(e) => e.stopPropagation()}>
          {users.length === 0 && <p className="mutedText">등록된 팀원이 없어요.</p>}
          {users.map((u) => (
            <label key={u.id} className="teamCheck">
              <input type="checkbox" checked={selected.includes(u.name)} onChange={() => toggle(u.name)} />
              {u.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function AutoGrowTextarea({ value, onCommit, className, placeholder, rows = 2 }) {
  const [text, setText] = useState(value || "");

  useEffect(() => {
    setText(value || "");
  }, [value]);

  return (
    <div className="growWrap" data-value={text}>
      <textarea
        className={className}
        rows={rows}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== (value || "")) onCommit(text);
        }}
        placeholder={placeholder}
      />
    </div>
  );
}

/* ============================================================
   PROJECT DETAIL PAGE -- full page (not a modal). Task-card list
   with subtasks/comments, a Gantt view, JSON backup, and drag
   reordering.
   ============================================================ */
function ProjectDetailPage({ project, users, tasks, updateTasks, onUpdate, onBack, onDelete, currentUser, updateNotifications }) {
  const [name, setName] = useState(project.name);
  const [editingName, setEditingName] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [view, setView] = useState("list"); // list | gantt
  const [ganttGranularity, setGanttGranularity] = useState("month"); // month | week
  const [ganttTrackWidth, setGanttTrackWidth] = useState(900);
  const ganttScrollRef = useRef(null);

  useEffect(() => {
    const el = ganttScrollRef.current;
    if (!el) return;
    const update = () => setGanttTrackWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const [statusFilter, setStatusFilter] = useState("all"); // all | doing | done
  const [search, setSearch] = useState("");
  const [quickAdd, setQuickAdd] = useState("");
  const [itemType, setItemType] = useState("task"); // task | memo
  const [collapsed, setCollapsed] = useState({});
  const [subtaskDraft, setSubtaskDraft] = useState({});
  const [commentDraft, setCommentDraft] = useState({});
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState(null);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [importInfo, setImportInfo] = useState(null);
  const fileInputRef = useRef(null);

  const toggleAccessUser = (userId) => {
    const current = project.accessUsers || [];
    const next = current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId];
    onUpdate({ accessUsers: next });
  };

  const saveName = () => {
    setEditingName(false);
    if (name.trim() && name.trim() !== project.name) {
      onUpdate({ name: name.trim() });
    } else {
      setName(project.name);
    }
  };

  const patchTask = (id, patch) => {
    updateTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, ...patch, updatedBy: currentUser.name, updatedAt: Date.now() } : t
      )
    );
  };

  const quickAddTask = () => {
    const text = quickAdd.trim();
    if (!text) return;
    const base = {
      id: (itemType === "memo" ? "memo_" : "task_") + Date.now(),
      type: itemType,
      text,
      team: project.team || "",
      projectId: project.id,
      comments: [],
      updatedBy: currentUser.name,
      updatedAt: Date.now(),
    };
    const newItem =
      itemType === "memo"
        ? { ...base, body: "" }
        : {
            ...base,
            assignees: [],
            done: false,
            description: "",
            subtasks: [],
            startDate: "",
            dueDate: "",
            category: "",
          };
    updateTasks((prev) => [...prev, newItem]);
    setQuickAdd("");
  };

  const deleteTask = (id) => {
    updateTasks((prev) => prev.filter((t) => t.id !== id));
    setConfirmDeleteTaskId(null);
  };

  const handleTaskDrop = (targetId) => {
    if (!draggedTaskId || draggedTaskId === targetId) {
      setDraggedTaskId(null);
      return;
    }
    updateTasks((prev) => {
      const list = [...prev];
      const fromIdx = list.findIndex((t) => t.id === draggedTaskId);
      const toIdx = list.findIndex((t) => t.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return list;
    });
    setDraggedTaskId(null);
  };

  const addSubtask = (taskId) => {
    const text = (subtaskDraft[taskId] || "").trim();
    if (!text) return;
    const task = tasks.find((t) => t.id === taskId);
    patchTask(taskId, {
      subtasks: [...(task.subtasks || []), { id: "sub_" + Date.now(), text, done: false }],
    });
    setSubtaskDraft((d) => ({ ...d, [taskId]: "" }));
  };

  const toggleSubtask = (taskId, subId) => {
    const task = tasks.find((t) => t.id === taskId);
    patchTask(taskId, {
      subtasks: (task.subtasks || []).map((s) => (s.id === subId ? { ...s, done: !s.done } : s)),
    });
  };

  const removeSubtask = (taskId, subId) => {
    const task = tasks.find((t) => t.id === taskId);
    patchTask(taskId, { subtasks: (task.subtasks || []).filter((s) => s.id !== subId) });
  };

  const editSubtask = (taskId, subId, text) => {
    const task = tasks.find((t) => t.id === taskId);
    patchTask(taskId, {
      subtasks: (task.subtasks || []).map((s) => (s.id === subId ? { ...s, text } : s)),
    });
  };

  const addComment = (taskId) => {
    const text = (commentDraft[taskId] || "").trim();
    if (!text) return;
    const task = tasks.find((t) => t.id === taskId);
    patchTask(taskId, {
      comments: [...(task.comments || []), { id: "c_" + Date.now(), text, author: currentUser.name, ts: Date.now() }],
    });
    setCommentDraft((d) => ({ ...d, [taskId]: "" }));

    const assigneeNames = task.assignees || (task.assignee ? [task.assignee] : []);
    const preview = text.length > 40 ? text.slice(0, 40) + "..." : text;
    assigneeNames.forEach((name) => {
      const recipient = users.find((u) => u.name === name);
      if (recipient && recipient.id !== currentUser.id) {
        pushNotification(
          updateNotifications,
          recipient.id,
          "comment",
          `${currentUser.name}님이 '${task.text}'에 댓글을 남겼어요: ${preview}`
        );
      }
    });
  };

  const backupProject = () => {
    const realTasks = tasks.filter((t) => t.type !== "memo");
    const memos = tasks.filter((t) => t.type === "memo");

    const taskRows = realTasks.map((t) => ({
      업무명: t.text,
      상태: t.done ? "완료" : "진행 중",
      카테고리: t.category || "",
      담당자: (t.assignees && t.assignees.length ? t.assignees.join(", ") : t.assignee || ""),
      시작일: t.startDate || "",
      마감일: t.dueDate || "",
      텍스트: t.description || "",
      "세부할일 진행률": `${(t.subtasks || []).filter((s) => s.done).length}/${(t.subtasks || []).length}`,
      "댓글 수": (t.comments || []).length,
      "최종 수정자": t.updatedBy || "",
      생성일시: t.updatedAt ? new Date(t.updatedAt).toLocaleString("ko-KR") : "",
    }));

    const subtaskRows = [];
    realTasks.forEach((t) => {
      (t.subtasks || []).forEach((s) => {
        subtaskRows.push({ 업무명: t.text, 세부할일: s.text, "완료 여부": s.done ? "완료" : "미완료" });
      });
    });

    const commentRows = [];
    realTasks.forEach((t) => {
      (t.comments || []).forEach((c) => {
        commentRows.push({
          업무명: t.text,
          작성자: c.author,
          댓글: c.text,
          작성일시: new Date(c.ts).toLocaleString("ko-KR"),
        });
      });
    });

    const memoRows = memos.map((m) => ({
      메모명: m.text,
      내용: m.body || "",
      작성자: m.updatedBy || "",
      생성일시: m.updatedAt ? new Date(m.updatedAt).toLocaleString("ko-KR") : "",
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskRows), "업무목록");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subtaskRows), "세부할일");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(commentRows), "댓글");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(memoRows), "메모");

    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name}-백업_${isoDate(new Date())}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportGanttXlsx = () => {
    const ganttTasksList = tasks.filter((t) => t.type !== "memo");
    if (ganttTasksList.length === 0) return;

    // Month columns spanning the same date range as the on-screen Gantt.
    const monthCols = [];
    const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (cursor < rangeEnd) {
      monthCols.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Group tasks by category, preserving first-seen order (same grouping as the on-screen Gantt).
    const groupOrder = [];
    const groupMap = {};
    ganttTasksList.forEach((t) => {
      const cat = t.category?.trim() || "미분류";
      if (!groupMap[cat]) {
        groupMap[cat] = [];
        groupOrder.push(cat);
      }
      groupMap[cat].push(t);
    });

    const HEADER_ROWS = 2;
    const FIXED_COLS = 2; // 중분류, 소분류
    const headerRow1 = ["중분류", "소분류"];
    const headerRow2 = ["", ""];
    monthCols.forEach((m) => {
      headerRow1.push(m.year);
      headerRow2.push(m.month + 1);
    });

    const aoa = [headerRow1, headerRow2];
    const fillCells = []; // {r, c} to shade for active months
    const catMergeRanges = [];
    let r = HEADER_ROWS;

    groupOrder.forEach((cat) => {
      const startRow = r;
      groupMap[cat].forEach((t) => {
        const row = [cat, t.text];
        monthCols.forEach((m, ci) => {
          const monthStart = new Date(m.year, m.month, 1);
          const monthEnd = new Date(m.year, m.month + 1, 0);
          let active = false;
          if (t.startDate && t.dueDate) {
            const s = new Date(t.startDate);
            const e = new Date(t.dueDate);
            active = s <= monthEnd && e >= monthStart;
          }
          row.push(active ? "■" : "");
          if (active) fillCells.push({ r, c: FIXED_COLS + ci });
        });
        aoa.push(row);
        r += 1;
      });
      if (r - 1 > startRow) catMergeRanges.push({ s: { r: startRow, c: 0 }, e: { r: r - 1, c: 0 } });
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Merge category cells (vertical) and year header cells (horizontal).
    const merges = [...catMergeRanges];
    let colCursor = FIXED_COLS;
    let mi = 0;
    while (mi < monthCols.length) {
      const y = monthCols[mi].year;
      const startCol = colCursor;
      while (mi < monthCols.length && monthCols[mi].year === y) {
        mi += 1;
        colCursor += 1;
      }
      if (colCursor - 1 > startCol) merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: colCursor - 1 } });
    }
    ws["!merges"] = merges;

    // Column widths: narrow month columns, wider category/task-name columns.
    ws["!cols"] = [{ wch: 12 }, { wch: 30 }, ...monthCols.map(() => ({ wch: 4 }))];

    // Best-effort cell shading -- Excel will still open fine even where
    // fill support is limited, since the "■" marker already shows the bar.
    fillCells.forEach(({ r: rr, c: cc }) => {
      const ref = XLSX.utils.encode_cell({ r: rr, c: cc });
      if (ws[ref]) {
        ws[ref].s = { fill: { patternType: "solid", fgColor: { rgb: "FFFF00" }, bgColor: { rgb: "FFFF00" } } };
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "간트");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
    const blob = new Blob([out], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name}-간트_${isoDate(new Date())}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const triggerImport = () => {
    setImportInfo(null);
    fileInputRef.current?.click();
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });

        const sheetRows = (name) => {
          const sheet = wb.Sheets[name];
          return sheet ? XLSX.utils.sheet_to_json(sheet, { defval: "" }) : [];
        };

        const taskRows = sheetRows("업무목록");
        const subtaskRows = sheetRows("세부할일");
        const commentRows = sheetRows("댓글");
        const memoRows = sheetRows("메모");

        // Helper: find a column value by trying several possible header names
        const pick = (row, candidates) => {
          for (const key of Object.keys(row)) {
            if (candidates.some((c) => key.includes(c))) return row[key];
          }
          return "";
        };

        const now = Date.now();
        const importedTasks = taskRows
          .filter((row) => String(pick(row, ["업무명"])).trim())
          .map((row, idx) => {
            const taskName = String(pick(row, ["업무명"])).trim();
            const status = String(pick(row, ["상태"])).trim();

            const subtasks = subtaskRows
              .filter((s) => String(pick(s, ["업무명"])).trim() === taskName)
              .map((s, sIdx) => ({
                id: `sub_import_${now}_${idx}_${sIdx}`,
                text: String(pick(s, ["세부할일", "할일"])).trim(),
                done: String(pick(s, ["완료"])).trim() === "완료",
              }))
              .filter((s) => s.text);

            const comments = commentRows
              .filter((c) => String(pick(c, ["업무명"])).trim() === taskName)
              .map((c, cIdx) => ({
                id: `c_import_${now}_${idx}_${cIdx}`,
                text: String(pick(c, ["댓글", "내용"])).trim(),
                author: String(pick(c, ["작성자", "수정자"])).trim() || "알 수 없음",
                ts: now,
              }))
              .filter((c) => c.text);

            return {
              id: `task_import_${now}_${idx}`,
              type: "task",
              text: taskName,
              team: project.team || "",
              projectId: project.id,
              assignees: String(pick(row, ["담당자"]))
                .split(/[,\/·]/)
                .map((s) => s.trim())
                .filter(Boolean),
              category: String(pick(row, ["카테고리", "중분류"])).trim(),
              done: status === "완료",
              description: String(pick(row, ["텍스트"])).trim(),
              subtasks,
              comments,
              startDate: String(pick(row, ["시작일"])).trim(),
              dueDate: String(pick(row, ["마감일"])).trim(),
              updatedBy: String(pick(row, ["최종 수정자", "수정자"])).trim() || currentUser.name,
              updatedAt: now,
            };
          });

        const importedMemos = memoRows
          .filter((row) => String(pick(row, ["메모명", "제목"])).trim())
          .map((row, idx) => ({
            id: `memo_import_${now}_${idx}`,
            type: "memo",
            text: String(pick(row, ["메모명", "제목"])).trim(),
            body: String(pick(row, ["내용", "텍스트"])).trim(),
            team: project.team || "",
            projectId: project.id,
            comments: [],
            updatedBy: String(pick(row, ["작성자", "수정자"])).trim() || currentUser.name,
            updatedAt: now,
          }));

        if (importedTasks.length === 0 && importedMemos.length === 0) {
          setImportInfo({ ok: false, message: "가져올 수 있는 업무를 찾지 못했어요. '업무목록' 시트 형식을 확인해주세요." });
          return;
        }

        // Skip anything that already exists in this project (same type + title + body/description),
        // so re-importing the same backup file doesn't create duplicates.
        const existingSignatures = new Set(
          tasks.map(
            (t) => `${t.type || "task"}::${t.text}::${t.type === "memo" ? t.body || "" : t.description || ""}`
          )
        );
        const dedupedTasks = [];
        importedTasks.forEach((t) => {
          const sig = `task::${t.text}::${t.description || ""}`;
          if (existingSignatures.has(sig)) return;
          existingSignatures.add(sig);
          dedupedTasks.push(t);
        });
        const dedupedMemos = [];
        importedMemos.forEach((m) => {
          const sig = `memo::${m.text}::${m.body || ""}`;
          if (existingSignatures.has(sig)) return;
          existingSignatures.add(sig);
          dedupedMemos.push(m);
        });
        const skippedCount = importedTasks.length + importedMemos.length - dedupedTasks.length - dedupedMemos.length;

        if (dedupedTasks.length === 0 && dedupedMemos.length === 0) {
          setImportInfo({ ok: true, message: "이미 다 가져온 내용이라 새로 추가된 게 없어요." });
          return;
        }

        updateTasks((prev) => [...prev, ...dedupedTasks, ...dedupedMemos]);
        const subtaskCount = dedupedTasks.reduce((sum, t) => sum + t.subtasks.length, 0);
        setImportInfo({
          ok: true,
          message: `업무 ${dedupedTasks.length}개, 세부할일 ${subtaskCount}개${
            dedupedMemos.length ? `, 메모 ${dedupedMemos.length}개` : ""
          }를 가져왔어요.${skippedCount > 0 ? ` (중복 ${skippedCount}개는 건너뜀)` : ""}`,
        });
      } catch (err) {
        setImportInfo({ ok: false, message: "파일을 읽는 중 문제가 생겼어요. 올바른 백업 파일인지 확인해주세요." });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const counts = {
    all: tasks.length,
    doing: tasks.filter((t) => t.type !== "memo" && !t.done).length,
    done: tasks.filter((t) => t.type !== "memo" && t.done).length,
    memo: tasks.filter((t) => t.type === "memo").length,
  };

  const existingCategories = [...new Set(tasks.filter((t) => t.category).map((t) => t.category))];

  const filtered = tasks
    .filter((t) => {
      if (statusFilter === "doing") return t.type !== "memo" && !t.done;
      if (statusFilter === "done") return t.type !== "memo" && t.done;
      if (statusFilter === "memo") return t.type === "memo";
      return true;
    })
    .filter((t) => !search.trim() || t.text.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  // ---- Gantt range + timeline calculation ----
  const dated = tasks.filter((t) => t.type !== "memo" && t.startDate && t.dueDate);
  const today = new Date();
  let rangeStart = new Date(today.getFullYear(), today.getMonth(), 1);
  let rangeEnd = new Date(rangeStart.getFullYear() + 1, rangeStart.getMonth(), 1); // default: 1-year window
  if (dated.length > 0) {
    const minStart = new Date(Math.min(...dated.map((t) => new Date(t.startDate).getTime())));
    const maxEnd = new Date(Math.max(...dated.map((t) => new Date(t.dueDate).getTime())));
    if (minStart < rangeStart) rangeStart = new Date(minStart.getFullYear(), minStart.getMonth(), 1);
    if (maxEnd > rangeEnd) rangeEnd = new Date(maxEnd.getFullYear(), maxEnd.getMonth() + 1, 1);
  }

  const buildPeriods = () => {
    const periods = [];
    if (ganttGranularity === "week") {
      const cursor = new Date(rangeStart);
      const day = cursor.getDay();
      const backToMonday = day === 0 ? -6 : 1 - day;
      cursor.setDate(cursor.getDate() + backToMonday);
      let prevMonth = null;
      while (cursor < rangeEnd) {
        const month = cursor.getMonth();
        const weekNum = Math.floor((cursor.getDate() - 1) / 7) + 1;
        const label = month !== prevMonth ? `${month + 1}월 ${weekNum}주` : `${weekNum}주`;
        periods.push({ start: new Date(cursor), label, year: cursor.getFullYear() });
        prevMonth = month;
        cursor.setDate(cursor.getDate() + 7);
      }
    } else {
      const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      while (cursor < rangeEnd) {
        periods.push({
          start: new Date(cursor),
          label: `${cursor.getMonth() + 1}월`,
          year: cursor.getFullYear(),
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    return periods;
  };
  const periods = buildPeriods();
  const yearGroups = [];
  periods.forEach((p, i) => {
    const last = yearGroups[yearGroups.length - 1];
    if (last && last.year === p.year) {
      last.count += 1;
    } else {
      yearGroups.push({ year: p.year, startIndex: i, count: 1 });
    }
  });
  const columnWidth = ganttGranularity === "week"
    ? Math.max(40, Math.min(56, (ganttTrackWidth - 220) / periods.length))
    : Math.max(60, Math.min(92, (ganttTrackWidth - 220) / periods.length));
  const daysPerCol = ganttGranularity === "week" ? 7 : 30.4;
  const pxPerDay = columnWidth / daysPerCol;
  const totalWidth = periods.length * columnWidth;

  const dayOffset = (d) => (d.getTime() - rangeStart.getTime()) / 86400000;
  const barPxPos = (t) => {
    const s = new Date(t.startDate);
    const e = new Date(t.dueDate);
    const left = Math.max(0, dayOffset(s) * pxPerDay);
    const width = Math.max(6, (dayOffset(e) - dayOffset(s)) * pxPerDay);
    return { left: `${left}px`, width: `${width}px` };
  };
  const todayLeft = Math.max(0, dayOffset(today) * pxPerDay);

  return (
    <div className="tabPane projPage">
      <div className="projPageHeader">
        <button className="backBtn" onClick={onBack}>
          <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} /> 목록으로
        </button>
        <div className="minorActions">
          <button className="minorIconBtn" onClick={triggerImport} title="xlsx 백업 파일에서 업무 가져오기">
            <Upload size={13} />
          </button>
          <button className="minorIconBtn" onClick={backupProject} title="이 프로젝트 백업(JSON) 다운로드">
            <Download size={13} />
          </button>
        </div>
      </div>

      <div className="modalHeader projPageTitleRow">
        {editingName ? (
          <input
            className="formInput"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
          />
        ) : (
          <span className="projModalTitle projPageTitle" onClick={() => setEditingName(true)} title="이름 수정">
            <span className="projColorDot" /> {project.name} <Pencil size={13} />
          </span>
        )}
      </div>

      <button className="accessToggle" onClick={() => setShowAccess((s) => !s)}>
        <Lock size={12} />
        {project.accessUsers && project.accessUsers.length > 0
          ? `${project.accessUsers.length}명만 접근 가능`
          : "전체 공개"}
        {showAccess ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {showAccess && (
        <div className="projModalSection">
          <div className="projModalLabel">읽기 권한 (사람별 선택, 아무도 선택 안 하면 전체 공개)</div>
          <div className="memberTeams">
            {users.map((u) => (
              <label key={u.id} className="teamCheck">
                <input
                  type="checkbox"
                  checked={(project.accessUsers || []).includes(u.id)}
                  onChange={() => toggleAccessUser(u.id)}
                />
                {u.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="projDescSection">
        <div className="taskFieldLabel block">프로젝트 설명</div>
        <AutoGrowTextarea
          className="composerInput autoGrow"
          rows={2}
          value={project.description || ""}
          onCommit={(val) => onUpdate({ description: val })}
          placeholder="이 프로젝트에 대한 설명을 남겨보세요"
        />
      </div>

      <div className="taskBoardToolbar">
        <div className="viewSwitch">
          <button className={"viewSwitchBtn" + (view === "list" ? " active" : "")} onClick={() => setView("list")}>
            업무
          </button>
          <button className={"viewSwitchBtn" + (view === "gantt" ? " active" : "")} onClick={() => setView("gantt")}>
            <BarChart3Icon /> 간트
          </button>
        </div>

        {view === "list" && (
          <div className="statusTabs">
            <button
              className={"statusTab" + (statusFilter === "all" ? " active" : "")}
              onClick={() => setStatusFilter("all")}
            >
              전체 <span className="countBadge">{counts.all}</span>
            </button>
            <button
              className={"statusTab" + (statusFilter === "doing" ? " active" : "")}
              onClick={() => setStatusFilter("doing")}
            >
              진행 중 <span className="countBadge">{counts.doing}</span>
            </button>
            <button
              className={"statusTab" + (statusFilter === "done" ? " active" : "")}
              onClick={() => setStatusFilter("done")}
            >
              완료 <span className="countBadge">{counts.done}</span>
            </button>
            <button
              className={"statusTab" + (statusFilter === "memo" ? " active" : "")}
              onClick={() => setStatusFilter("memo")}
            >
              메모 <span className="countBadge">{counts.memo}</span>
            </button>
          </div>
        )}

        {view === "list" && (
          <input
            className="formInput taskSearch"
            placeholder="업무 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </div>

      <input
        type="file"
        accept=".xlsx"
        ref={fileInputRef}
        onChange={handleImportFile}
        style={{ display: "none" }}
      />

      {importInfo && (
        <div className={"importBanner" + (importInfo.ok ? "" : " error")}>
          {importInfo.message}
          <button className="iconBtn" onClick={() => setImportInfo(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <datalist id="categoryOptions">
        {existingCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {view === "list" && (
        <>
          <div className="quickAddRow">
            <div className="itemTypeToggle">
              <button
                className={"itemTypeBtn" + (itemType === "task" ? " active" : "")}
                onClick={() => setItemType("task")}
                title="업무로 추가"
              >
                <CheckCircle2 size={13} /> 업무
              </button>
              <button
                className={"itemTypeBtn" + (itemType === "memo" ? " active" : "")}
                onClick={() => setItemType("memo")}
                title="메모로 추가"
              >
                <Pencil size={13} /> 메모
              </button>
            </div>
            <input
              className="formInput grow"
              placeholder={itemType === "memo" ? "새 메모 추가하고 Enter (회의 내용 등)" : "새 업무 추가하고 Enter"}
              value={quickAdd}
              onChange={(e) => setQuickAdd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && quickAddTask()}
            />
            <button className="btnPrimary small" onClick={quickAddTask} disabled={!quickAdd.trim()}>
              추가
            </button>
          </div>

          <div className="taskCardList">
            {filtered.length === 0 && <p className="mutedText">표시할 업무가 없어요.</p>}
            {filtered.map((t) => {
              const isMemo = t.type === "memo";
              const isCollapsed = collapsed[t.id] ?? true;
              const subDone = (t.subtasks || []).filter((s) => s.done).length;
              const subTotal = (t.subtasks || []).length;

              return (
                <div
                  className={"taskCard" + (isMemo ? " memoCard" : "")}
                  key={t.id}
                  draggable
                  onDragStart={() => setDraggedTaskId(t.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleTaskDrop(t.id)}
                >
                  <div className="taskCardTop">
                    <GripVertical size={14} className="dragHandle" />
                    <span className={"statusPill" + (isMemo ? " memo" : t.done ? " done" : "")}>
                      {isMemo ? "메모" : t.done ? "완료" : "진행 중"}
                    </span>
                    {t.updatedBy && (
                      <span className="taskUpdatedMeta">
                        최종 수정 {t.updatedBy} · {timeAgo(t.updatedAt || Date.now())}
                      </span>
                    )}
                    <div className="taskTopRightActions">
                      <button
                        className="expandToggleBtn"
                        onClick={() => setCollapsed((c) => ({ ...c, [t.id]: !isCollapsed }))}
                        title={isCollapsed ? "펼치기" : "접기"}
                      >
                        {isCollapsed ? "열기" : "접기"}
                        {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                      </button>
                      {confirmDeleteTaskId === t.id ? (
                        <div className="projDeleteConfirm">
                          <button className="btnDangerSmall" onClick={() => deleteTask(t.id)}>
                            삭제
                          </button>
                          <button className="btnGhost small" onClick={() => setConfirmDeleteTaskId(null)}>
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          className="iconBtn danger"
                          onClick={() => setConfirmDeleteTaskId(t.id)}
                          title="업무 삭제"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    className="taskCardTitle"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const text = e.currentTarget.textContent.trim();
                      if (text && text !== t.text) patchTask(t.id, { text });
                      else e.currentTarget.textContent = t.text;
                    }}
                  >
                    {t.text}
                  </div>

                  {!isCollapsed && (
                    <>
                      {!isMemo && (
                        <div className="taskCardFieldsRow">
                          <label className="taskFieldLabel">
                            카테고리
                            <input
                              className="formInput"
                              list="categoryOptions"
                              value={t.category || ""}
                              onChange={(e) => patchTask(t.id, { category: e.target.value })}
                              placeholder="예: 안정성"
                            />
                          </label>
                          <label className="taskFieldLabel">
                            담당자
                            <MultiAssigneeSelect
                              users={users}
                              selected={t.assignees || (t.assignee ? [t.assignee] : [])}
                              onChange={(names) => patchTask(t.id, { assignees: names })}
                            />
                          </label>
                          <label className="taskFieldLabel">
                            시작일
                            <input
                              className="formInput"
                              type="date"
                              value={t.startDate || ""}
                              onChange={(e) => patchTask(t.id, { startDate: e.target.value })}
                            />
                          </label>
                          <label className="taskFieldLabel">
                            마감일
                            <input
                              className="formInput"
                              type="date"
                              value={t.dueDate || ""}
                              onChange={(e) => patchTask(t.id, { dueDate: e.target.value })}
                            />
                          </label>
                          <button
                            className="statusToggleBtn"
                            onClick={() => patchTask(t.id, { done: !t.done })}
                          >
                            {t.done ? <Circle size={13} /> : <CheckCircle2 size={13} />}
                            {t.done ? "진행중으로" : "완료 처리"}
                          </button>
                        </div>
                      )}

                      {isMemo ? (
                        <>
                          <div className="taskFieldLabel block">회의 / 메모 내용</div>
                          <AutoGrowTextarea
                            className="composerInput autoGrow"
                            rows={4}
                            value={t.body || ""}
                            onCommit={(val) => patchTask(t.id, { body: val })}
                            placeholder="회의 내용, 결정 사항 등을 기록하세요"
                          />
                        </>
                      ) : (
                        <>
                          <div className="taskFieldLabel block">텍스트</div>
                          <AutoGrowTextarea
                            className="composerInput autoGrow"
                            rows={2}
                            value={t.description || ""}
                            onCommit={(val) => patchTask(t.id, { description: val })}
                            placeholder="설명을 남겨보세요"
                          />

                          <div className="taskFieldLabel block">
                            세부 할일 ({subDone}/{subTotal})
                          </div>
                          <div className="subtaskList">
                            {(t.subtasks || []).map((s) => (
                              <div key={s.id} className="subtaskRow">
                                <label className="subtaskCheck">
                                  <input
                                    type="checkbox"
                                    checked={s.done}
                                    onChange={() => toggleSubtask(t.id, s.id)}
                                  />
                                  <span
                                    className={s.done ? "done" : ""}
                                    contentEditable
                                    suppressContentEditableWarning
                                    onClick={(e) => e.preventDefault()}
                                    onBlur={(e) => {
                                      const text = e.currentTarget.textContent.trim();
                                      if (text && text !== s.text) editSubtask(t.id, s.id, text);
                                      else e.currentTarget.textContent = s.text;
                                    }}
                                  >
                                    {s.text}
                                  </span>
                                </label>
                                <button className="subtaskRemove" onClick={() => removeSubtask(t.id, s.id)}>
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="inlineForm">
                            <input
                              className="formInput grow"
                              placeholder="세부 할일 추가하고 Enter..."
                              value={subtaskDraft[t.id] || ""}
                              onChange={(e) => setSubtaskDraft((d) => ({ ...d, [t.id]: e.target.value }))}
                              onKeyDown={(e) => e.key === "Enter" && addSubtask(t.id)}
                            />
                            <button className="btnPrimary small" onClick={() => addSubtask(t.id)}>
                              추가
                            </button>
                          </div>
                        </>
                      )}

                      <div className="taskFieldLabel block">댓글 ({(t.comments || []).length})</div>
                      <div className="commentSection">
                        {(t.comments || []).length === 0 && <p className="mutedText">아직 댓글이 없어요.</p>}
                        {(t.comments || []).map((c) => (
                          <div className="commentRow" key={c.id}>
                            <Avatar name={c.author} />
                            <div>
                              <div className="commentMeta">
                                <span className="commentAuthor">{c.author}</span>
                                <span className="commentTime">{new Date(c.ts).toLocaleString("ko-KR")}</span>
                              </div>
                              <div className="commentText">{c.text}</div>
                            </div>
                          </div>
                        ))}
                        <div className="commentComposer">
                          <input
                            value={commentDraft[t.id] || ""}
                            onChange={(e) => setCommentDraft((d) => ({ ...d, [t.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && addComment(t.id)}
                            placeholder="댓글 남기기"
                            className="commentInput"
                          />
                          <button className="btnGhost" onClick={() => addComment(t.id)}>
                            <MessageCircle size={14} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === "gantt" && (
        <div className="ganttWrap">
          {tasks.filter((t) => t.type !== "memo").length === 0 ? (
            <p className="mutedText">표시할 업무가 없어요.</p>
          ) : (
            <>
              <div className="ganttToolbar">
                <div className="ganttRangeLabel">
                  {rangeStart.toLocaleDateString("ko-KR")} ~ {rangeEnd.toLocaleDateString("ko-KR")}
                </div>
                <div className="viewSwitch">
                  <button
                    className={"viewSwitchBtn" + (ganttGranularity === "month" ? " active" : "")}
                    onClick={() => setGanttGranularity("month")}
                  >
                    월별
                  </button>
                  <button
                    className={"viewSwitchBtn" + (ganttGranularity === "week" ? " active" : "")}
                    onClick={() => setGanttGranularity("week")}
                  >
                    주별
                  </button>
                </div>
                <button className="minorIconBtn" onClick={exportGanttXlsx} title="간트 데이터를 엑셀로 다운로드">
                  <Download size={13} />
                </button>
              </div>

              <div className="ganttScroll" ref={ganttScrollRef}>
                <div className="ganttInner" style={{ width: totalWidth + 220 }}>
                  <div className="ganttHeaderRow">
                    <div className="ganttLabel ganttLabelHead">업무</div>
                    <div className="ganttHeaderTrackWrap" style={{ width: totalWidth }}>
                      {ganttGranularity === "month" && (
                        <div className="ganttYearRow" style={{ width: totalWidth }}>
                          {yearGroups.map((g, i) => (
                            <div
                              key={i}
                              className="ganttYearCol"
                              style={{ left: g.startIndex * columnWidth, width: g.count * columnWidth }}
                            >
                              {g.year}년
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="ganttTrack ganttHeaderTrack" style={{ width: totalWidth }}>
                        {periods.map((p, i) => (
                          <div
                            key={i}
                            className="ganttPeriodCol"
                            style={{ left: i * columnWidth, width: columnWidth }}
                          >
                            {p.label}
                          </div>
                        ))}
                        <div className="ganttTodayLine" style={{ left: todayLeft }} title="오늘" />
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const ganttTasks = tasks.filter((t) => t.type !== "memo");
                    const groupOrder = [];
                    const groupMap = {};
                    ganttTasks.forEach((t) => {
                      const cat = t.category?.trim() || "미분류";
                      if (!groupMap[cat]) {
                        groupMap[cat] = [];
                        groupOrder.push(cat);
                      }
                      groupMap[cat].push(t);
                    });

                    return groupOrder.map((cat) => (
                      <React.Fragment key={cat}>
                        <div className="ganttCategoryRow" style={{ width: totalWidth + 220 }}>
                          {cat}
                        </div>
                        {groupMap[cat].map((t) => (
                          <div className="ganttRow" key={t.id}>
                            <div className="ganttLabel" title={t.text}>
                              {t.text}
                            </div>
                            <div className="ganttTrack" style={{ width: totalWidth }}>
                              {periods.map((p, i) => (
                                <div key={i} className="ganttGridLine" style={{ left: i * columnWidth }} />
                              ))}
                              <div className="ganttTodayLine" style={{ left: todayLeft }} />
                              {t.startDate && t.dueDate ? (
                                <div
                                  className={"ganttBar" + (t.done ? " done" : "")}
                                  style={barPxPos(t)}
                                  title={`${t.startDate} ~ ${t.dueDate}`}
                                />
                              ) : (
                                <span className="ganttNoDate">날짜 미설정</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </React.Fragment>
                    ));
                  })()}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="projModalFooter">
        {confirmDelete ? (
          <>
            <span className="mutedText">프로젝트를 삭제할까요?</span>
            <button className="btnDangerSmall" onClick={onDelete}>
              삭제 확인
            </button>
            <button className="btnGhost small" onClick={() => setConfirmDelete(false)}>
              취소
            </button>
          </>
        ) : (
          <button className="btnGhost small" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={13} /> 프로젝트 삭제
          </button>
        )}
      </div>
    </div>
  );
}

function BarChart3Icon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" />
      <rect x="12" y="8" width="3" height="10" />
      <rect x="17" y="5" width="3" height="13" />
    </svg>
  );
}

/* ============================================================
   WEEKLY KEY TASKS ("이번주 주요업무") -- per-person weekly summary,
   for team leads to see what each member is focused on this week.
   Card grid (one per team member) -> click into a per-person page
   with week navigation. Each item is feed-like: title, text/memo,
   comments, and a link to an actual project task -- no subtasks.
   ============================================================ */

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function mondayOf(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}
function addDays(d, n) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}
function weekLabel(monday) {
  const sunday = addDays(monday, 6);
  const weekNum = Math.floor((monday.getDate() - 1) / 7) + 1;
  const fmt = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${monday.getFullYear()}년 ${monday.getMonth() + 1}월 ${weekNum}주차 (${fmt(monday)} ~ ${fmt(sunday)})`;
}

function WeeklyTab({ weeklyTasks, updateWeeklyTasks, users, projects, tasks, updateTasks, currentUser, isAdmin, updateNotifications }) {
  const [openUserId, setOpenUserId] = useState(null);

  useEffect(() => {
    const handler = () => setOpenUserId(null);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const openPersonDetail = (id) => {
    try {
      window.history.pushState({ jtmDetail: "person" }, "");
    } catch (e) {}
    setOpenUserId(id);
  };

  const closePersonDetail = () => {
    setOpenUserId(null);
    try {
      if (window.history.state && window.history.state.jtmDetail === "person") {
        window.history.back();
      }
    } catch (e) {}
  };

  const PERSON_COLORS = ["#087FBE", "#FF6F4D", "#3976BA", "#7E57C2", "#C2872F", "#3E8E5B"];
  const colorFor = (id) => {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % PERSON_COLORS.length;
    return PERSON_COLORS[h];
  };

  const canView = (u) => isAdmin || u.id === currentUser.id || (u.weeklyViewers || []).includes(currentUser.id);
  const thisMonday = isoDate(mondayOf(new Date()));

  const statsFor = (userId) => {
    const items = weeklyTasks.filter((w) => w.userId === userId && w.weekStart === thisMonday);
    return { total: items.length, done: items.filter((w) => w.done).length };
  };

  const openUser = users.find((u) => u.id === openUserId && canView(u));

  if (openUser) {
    return (
      <WeeklyPersonDetailPage
        user={openUser}
        weeklyTasks={weeklyTasks}
        updateWeeklyTasks={updateWeeklyTasks}
        projects={projects}
        tasks={tasks}
        currentUser={currentUser}
        onBack={closePersonDetail}
        updateNotifications={updateNotifications}
      />
    );
  }

  return (
    <div className="tabPane">
      <div className="paneHeaderRow">
        <h3 className="paneTitle">
          이번 주 주요 수행업무 <span className="countBadge">{users.length}</span>
        </h3>
      </div>

      {users.length === 0 && (
        <div className="emptyState">
          <Users size={22} />
          <p>등록된 팀원이 없어요.</p>
        </div>
      )}

      <div className="projCardGrid">
        {users.map((u) => {
          const stats = statsFor(u.id);
          const entryAllowed = canView(u);
          return (
            <div
              key={u.id}
              className={"projCard weeklyPersonCard" + (entryAllowed ? "" : " locked")}
              onClick={() => entryAllowed && openPersonDetail(u.id)}
              style={{ cursor: entryAllowed ? "pointer" : "default" }}
            >
              <div className="weeklyAvatar" style={{ background: colorFor(u.id) }}>
                {u.name.trim().charAt(0)}
              </div>
              <div className="projCardTitle">{u.name}</div>
              {entryAllowed ? (
                <div className="projCardMeta">
                  {stats.total === 0 ? "이번 주 업무 없음" : `${stats.done} / ${stats.total}건 완료`}
                </div>
              ) : (
                <div className="projAccessTag">
                  <Lock size={10} /> 접근 권한이 없어요
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeeklyPersonDetailPage({ user, weeklyTasks, updateWeeklyTasks, projects, tasks, currentUser, onBack, updateNotifications }) {
  const [weekMonday, setWeekMonday] = useState(mondayOf(new Date()));
  const [quickAdd, setQuickAdd] = useState("");
  const [openId, setOpenId] = useState(null);
  const [commentDraft, setCommentDraft] = useState({});
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const weekStartIso = isoDate(weekMonday);
  const isCurrentWeek = weekStartIso === isoDate(mondayOf(new Date()));

  const items = weeklyTasks.filter((w) => w.userId === user.id && w.weekStart === weekStartIso);
  const doneCount = items.filter((w) => w.done).length;

  const patchItem = (id, patch) => {
    updateWeeklyTasks((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, ...patch, updatedBy: currentUser.name, updatedAt: Date.now() } : w
      )
    );
  };

  const quickAddItem = () => {
    const text = quickAdd.trim();
    if (!text) return;
    updateWeeklyTasks((prev) => [
      ...prev,
      {
        id: "wk_" + Date.now(),
        userId: user.id,
        userName: user.name,
        weekStart: weekStartIso,
        text,
        body: "",
        done: false,
        comments: [],
        linkedProjectId: null,
        linkedTaskId: null,
        updatedBy: currentUser.name,
        updatedAt: Date.now(),
      },
    ]);
    setQuickAdd("");
  };

  const deleteItem = (id) => {
    updateWeeklyTasks((prev) => prev.filter((w) => w.id !== id));
    setConfirmDeleteId(null);
  };

  const addComment = (id) => {
    const text = (commentDraft[id] || "").trim();
    if (!text) return;
    const item = items.find((w) => w.id === id);
    patchItem(id, {
      comments: [...(item.comments || []), { id: "c_" + Date.now(), text, author: currentUser.name, ts: Date.now() }],
    });
    setCommentDraft((d) => ({ ...d, [id]: "" }));

    if (user.id !== currentUser.id) {
      const preview = text.length > 40 ? text.slice(0, 40) + "..." : text;
      pushNotification(
        updateNotifications,
        user.id,
        "comment",
        `${currentUser.name}님이 '${item.text}'에 댓글을 남겼어요: ${preview}`
      );
    }
  };

  return (
    <div className="tabPane projPage">
      <div className="projPageHeader">
        <button className="backBtn" onClick={onBack}>
          <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} /> 목록으로
        </button>
      </div>

      <div className="modalHeader projPageTitleRow">
        <span className="projModalTitle projPageTitle">
          <span className="weeklyAvatar small" style={{ background: "var(--teal)" }}>
            {user.name.trim().charAt(0)}
          </span>
          {user.name}님의 이번 주 주요 업무
        </span>
      </div>

      <div className="weekNavRow">
        <button className="iconBtn" onClick={() => setWeekMonday((d) => addDays(d, -7))}>
          <ChevronDown size={15} style={{ transform: "rotate(90deg)" }} />
        </button>
        <span className="weekNavLabel">{weekLabel(weekMonday)}</span>
        {isCurrentWeek ? (
          <span className="weekNowTag">이번주</span>
        ) : (
          <button className="weekNowBtn" onClick={() => setWeekMonday(mondayOf(new Date()))}>
            이번주로
          </button>
        )}
        <button className="iconBtn" onClick={() => setWeekMonday((d) => addDays(d, 7))}>
          <ChevronDown size={15} style={{ transform: "rotate(-90deg)" }} />
        </button>
        <span className="weekDoneSummary">
          {doneCount}/{items.length} 완료
        </span>
      </div>

      <div className="quickAddRow">
        <input
          className="formInput grow"
          placeholder="이번 주 주요 업무 추가하고 Enter"
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && quickAddItem()}
        />
        <button className="btnPrimary small" onClick={quickAddItem} disabled={!quickAdd.trim()}>
          추가
        </button>
      </div>

      <div className="taskCardList">
        {items.length === 0 && <p className="mutedText">이 주에 등록된 주요 업무가 없어요.</p>}
        {items.map((w) => {
          const isOpen = openId === w.id;
          const linkedProject = projects.find((p) => p.id === w.linkedProjectId);
          const projectTasks = tasks.filter((t) => t.projectId === w.linkedProjectId && t.type !== "memo");
          const commentCount = (w.comments || []).length;

          return (
            <div className="announceCard" key={w.id}>
              <button className="announceRow" onClick={() => setOpenId(isOpen ? null : w.id)}>
                <span className={"statusPill" + (w.done ? " done" : "")}>{w.done ? "완료" : "진행 중"}</span>
                <span className="announceRowPreview">{w.text}</span>
                {commentCount > 0 && <span className="announceRowCommentCount">💬 {commentCount}</span>}
                <span className="announceRowToggle">
                  {isOpen ? "접기" : "열기"}
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {isOpen && (
                <div className="announceDetail">
                  <div className="taskCardTop weeklyDetailTop">
                    {w.updatedBy && (
                      <span className="taskUpdatedMeta noAutoMargin">
                        최종 수정 {w.updatedBy} · {timeAgo(w.updatedAt || Date.now())}
                      </span>
                    )}
                    {confirmDeleteId === w.id ? (
                      <div className="projDeleteConfirm">
                        <button className="btnDangerSmall" onClick={() => deleteItem(w.id)}>
                          삭제
                        </button>
                        <button className="btnGhost small" onClick={() => setConfirmDeleteId(null)}>
                          취소
                        </button>
                      </div>
                    ) : (
                      <button className="iconBtn danger" onClick={() => setConfirmDeleteId(w.id)} title="삭제">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  <div
                    className="taskCardTitle"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const text = e.currentTarget.textContent.trim();
                      if (text && text !== w.text) patchItem(w.id, { text });
                      else e.currentTarget.textContent = w.text;
                    }}
                  >
                    {w.text}
                  </div>

                  <button className="statusToggleBtn weeklyStatusBtn" onClick={() => patchItem(w.id, { done: !w.done })}>
                    {w.done ? <Circle size={13} /> : <CheckCircle2 size={13} />}
                    {w.done ? "진행중으로" : "완료 처리"}
                  </button>

                  <div className="taskFieldLabel block">텍스트</div>
                  <AutoGrowTextarea
                    className="composerInput autoGrow"
                    rows={2}
                    value={w.body || ""}
                    onCommit={(val) => patchItem(w.id, { body: val })}
                    placeholder="메모를 적어보세요..."
                  />

                  <div className="taskFieldLabel block">댓글 ({(w.comments || []).length})</div>
                  <div className="commentSection">
                    {(w.comments || []).length === 0 && <p className="mutedText">아직 댓글이 없어요.</p>}
                    {(w.comments || []).map((c) => (
                      <div className="commentRow" key={c.id}>
                        <Avatar name={c.author} />
                        <div>
                          <div className="commentMeta">
                            <span className="commentAuthor">{c.author}</span>
                            <span className="commentTime">{new Date(c.ts).toLocaleString("ko-KR")}</span>
                          </div>
                          <div className="commentText">{c.text}</div>
                        </div>
                      </div>
                    ))}
                    <div className="commentComposer">
                      <input
                        value={commentDraft[w.id] || ""}
                        onChange={(e) => setCommentDraft((d) => ({ ...d, [w.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && addComment(w.id)}
                        placeholder={`${currentUser.name}(으)로 댓글 남기기...`}
                        className="commentInput"
                      />
                      <button className="btnGhost" onClick={() => addComment(w.id)}>
                        <MessageCircle size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="taskFieldLabel block">🔗 연결된 업무</div>
                  <div className="linkedTaskRow">
                    <select
                      className="formSelect grow"
                      value={w.linkedProjectId || ""}
                      onChange={(e) => patchItem(w.id, { linkedProjectId: e.target.value || null, linkedTaskId: null })}
                    >
                      <option value="">프로젝트 선택</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="formSelect grow"
                      value={w.linkedTaskId || ""}
                      onChange={(e) => patchItem(w.id, { linkedTaskId: e.target.value || null })}
                      disabled={!w.linkedProjectId}
                    >
                      <option value="">업무 선택</option>
                      {projectTasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.text}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   ADMIN TAB -- signup requests, member/permission management,
   team management
   ============================================================ */
function AdminTab({ users, updateUsers, teams, updateTeams, currentUser }) {
  const [newTeam, setNewTeam] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [expandedWeeklyId, setExpandedWeeklyId] = useState(null);

  const pending = users.filter((u) => u.status === "pending");
  const approved = users.filter((u) => u.status === "approved");
  const adminCount = approved.filter((u) => u.role === "admin").length;

  const approve = (id, grantedTeams) => {
    updateUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, status: "approved", teams: grantedTeams } : u))
    );
  };

  const reject = (id) => {
    updateUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const toggleWeeklyViewer = (targetId, viewerId) => {
    updateUsers((prev) =>
      prev.map((u) => {
        if (u.id !== targetId) return u;
        const current = u.weeklyViewers || [];
        const next = current.includes(viewerId)
          ? current.filter((v) => v !== viewerId)
          : [...current, viewerId];
        return { ...u, weeklyViewers: next };
      })
    );
  };

  const toggleUserTeam = (id, team) => {
    updateUsers((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u;
        const has = u.teams.includes(team);
        return { ...u, teams: has ? u.teams.filter((t) => t !== team) : [...u.teams, team] };
      })
    );
  };

  const toggleRole = (id) => {
    updateUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, role: u.role === "admin" ? "member" : "admin" } : u))
    );
  };

  const deleteUser = (id) => {
    // Only removes the account record. Posts / comments / tasks store the
    // author's name as plain text, so past content is left untouched.
    updateUsers((prev) => prev.filter((u) => u.id !== id));
    setConfirmDeleteId(null);
  };

  const resetPassword = (id) => {
    // Clears the password hash so the user is prompted to set a new one
    // the next time they log in -- doesn't touch their team access or role.
    updateUsers((prev) => prev.map((u) => (u.id === id ? { ...u, passwordHash: null } : u)));
  };

  const addTeam = () => {
    const t = newTeam.trim();
    if (!t || teams.includes(t)) return;
    updateTeams((prev) => [...prev, t]);
    setNewTeam("");
  };

  return (
    <div className="tabPane">
      <section className="adminSection">
        <h3 className="paneTitle">
          가입 승인 대기 {pending.length > 0 && <span className="countBadge">{pending.length}</span>}
        </h3>
        {pending.length === 0 && <p className="mutedText">대기 중인 가입 신청이 없어요.</p>}
        {pending.map((u) => (
          <PendingRow key={u.id} user={u} teams={teams} onApprove={approve} onReject={reject} />
        ))}
      </section>

      <section className="adminSection">
        <h3 className="paneTitle">회원 관리</h3>
        <div className="memberTable">
          {approved.map((u) => {
            const isSelf = u.id === currentUser.id;
            const isLastAdmin = u.role === "admin" && adminCount === 1;
            const isWeeklyExpanded = expandedWeeklyId === u.id;
            return (
              <React.Fragment key={u.id}>
                <div className="memberRow">
                  <div className="memberIdent">
                    <Avatar name={u.name} />
                    <div>
                      <div className="memberName">
                        {u.name} {isSelf && <span className="youTag">나</span>}
                      </div>
                    </div>
                  </div>

                  <div className="memberTeams">
                    {teams.map((t) => (
                      <label key={t} className="teamCheck">
                        <input
                          type="checkbox"
                          checked={u.teams.includes(t)}
                          onChange={() => toggleUserTeam(u.id, t)}
                        />
                        {t}
                      </label>
                    ))}
                  </div>

                  <button
                    className={"weeklyPermBtn" + ((u.weeklyViewers || []).length > 0 ? " on" : "")}
                    onClick={() => setExpandedWeeklyId(isWeeklyExpanded ? null : u.id)}
                    title="이번주 주요업무 열람 권한 설정"
                  >
                    <Calendar size={13} />
                    {(u.weeklyViewers || []).length > 0 ? `${u.weeklyViewers.length}명 열람가능` : "주간업무 비공개"}
                  </button>

                  <button
                    className={"roleBtn" + (u.role === "admin" ? " isAdmin" : "")}
                    onClick={() => toggleRole(u.id)}
                    disabled={isLastAdmin}
                    title={isLastAdmin ? "마지막 관리자는 권한을 내릴 수 없어요" : "권한 전환"}
                  >
                    <ShieldCheck size={13} /> {u.role === "admin" ? "관리자" : "일반"}
                  </button>

                  <button
                    className="pwResetBtn"
                    onClick={() => resetPassword(u.id)}
                    title="비밀번호를 초기화하면 다음 로그인 시 새 비밀번호를 설정하게 돼요"
                  >
                    비번초기화
                  </button>

                  {confirmDeleteId === u.id ? (
                    <div className="deleteConfirmRow">
                      <span>삭제할까요?</span>
                      <button className="btnDangerSmall" onClick={() => deleteUser(u.id)}>
                        확인
                      </button>
                      <button className="btnGhost small" onClick={() => setConfirmDeleteId(null)}>
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      className="iconBtn danger"
                      onClick={() => setConfirmDeleteId(u.id)}
                      disabled={isLastAdmin}
                      title={isLastAdmin ? "마지막 관리자는 삭제할 수 없어요" : "계정 삭제"}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {isWeeklyExpanded && (
                  <div className="weeklyPermPanel">
                    <div className="projModalLabel">
                      {u.name}님의 "이번주 주요업무"를 볼 수 있는 사람 (본인과 관리자는 항상 볼 수 있어요)
                    </div>
                    <div className="memberTeams">
                      {approved
                        .filter((v) => v.id !== u.id)
                        .map((v) => (
                          <label key={v.id} className="teamCheck">
                            <input
                              type="checkbox"
                              checked={(u.weeklyViewers || []).includes(v.id)}
                              onChange={() => toggleWeeklyViewer(u.id, v.id)}
                            />
                            {v.name}
                          </label>
                        ))}
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </section>

      <section className="adminSection">
        <h3 className="paneTitle">팀 관리</h3>
        <div className="inlineForm">
          <input
            className="formInput grow"
            placeholder="새 팀 이름 (예: TF1)"
            value={newTeam}
            onChange={(e) => setNewTeam(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTeam()}
          />
          <button className="btnPrimary small" onClick={addTeam} disabled={!newTeam.trim()}>
            <Plus size={14} /> 팀 추가
          </button>
        </div>
        <div className="teamChipRow">
          {teams.map((t) => (
            <span key={t} className="teamChip">
              {t}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function PendingRow({ user, teams, onApprove, onReject }) {
  const [selected, setSelected] = useState([]);

  const toggle = (t) => {
    setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  };

  return (
    <div className="pendingRow">
      <div className="memberIdent">
        <Avatar name={user.name} />
        <div>
          <div className="memberName">{user.name}</div>
        </div>
      </div>
      <div className="memberTeams">
        {teams.map((t) => (
          <label key={t} className="teamCheck">
            <input type="checkbox" checked={selected.includes(t)} onChange={() => toggle(t)} />
            {t}
          </label>
        ))}
      </div>
      <div className="pendingActions">
        <button
          className="btnPrimary small"
          disabled={selected.length === 0}
          onClick={() => onApprove(user.id, selected)}
          title={selected.length === 0 ? "팀을 하나 이상 선택해주세요" : "승인"}
        >
          <UserCheck size={14} /> 승인
        </button>
        <button className="btnGhost small" onClick={() => onReject(user.id)}>
          <UserX size={14} /> 거절
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   DAILY TASKS PANEL ("오늘의 업무") -- private per-person daily
   checklist. Never shown to anyone but the owner (no admin view).
   Collapsible month calendar + day navigator + monthly xlsx backup.
   ============================================================ */
function DailyTasksPanel({ dailyTasks, updateDailyTasks, currentUser }) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [quickAdd, setQuickAdd] = useState("");

  const myTasks = dailyTasks.filter((t) => t.userId === currentUser.id);
  const selectedIso = isoDate(selectedDate);
  const todayIso = isoDate(today);

  const dayItems = myTasks.filter((t) => t.date === selectedIso);
  const doneCount = dayItems.filter((t) => t.done).length;

  const datesWithTasks = new Set(
    myTasks
      .filter((t) => {
        const d = new Date(t.date);
        return d.getFullYear() === viewMonth.getFullYear() && d.getMonth() === viewMonth.getMonth();
      })
      .map((t) => t.date)
  );

  const goMonth = (delta) => {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  const pickDate = (d) => {
    setSelectedDate(d);
    if (d.getMonth() !== viewMonth.getMonth() || d.getFullYear() !== viewMonth.getFullYear()) {
      setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  };

  const goDay = (delta) => {
    const next = addDays(selectedDate, delta);
    pickDate(next);
  };

  const jumpToday = () => {
    const t = new Date();
    setViewMonth(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedDate(new Date(t.getFullYear(), t.getMonth(), t.getDate()));
  };

  const addItem = () => {
    const text = quickAdd.trim();
    if (!text) return;
    updateDailyTasks((prev) => [
      ...prev,
      {
        id: "daily_" + Date.now(),
        userId: currentUser.id,
        date: selectedIso,
        text,
        done: false,
        ts: Date.now(),
      },
    ]);
    setQuickAdd("");
  };

  const toggleItem = (id) => {
    updateDailyTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const deleteItem = (id) => {
    updateDailyTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const editItem = (id, text) => {
    updateDailyTasks((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));
  };

  const backupMonth = () => {
    const sorted = myTasks
      .filter((t) => {
        const d = new Date(t.date);
        return d.getFullYear() === viewMonth.getFullYear() && d.getMonth() === viewMonth.getMonth();
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const seenSoFar = {};
    const rows = sorted.map((t) => {
      seenSoFar[t.date] = (seenSoFar[t.date] || 0) + 1;
      return {
        날짜: t.date,
        번호: seenSoFar[t.date],
        "할 일": t.text,
        완료여부: t.done ? "완료" : "미완료",
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "오늘의업무");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentUser.name}-${viewMonth.getFullYear()}.${viewMonth.getMonth() + 1}월-오늘의업무.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // build calendar grid cells (Sun-first)
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));

  const dateLabel = `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 (${["일", "월", "화", "수", "목", "금", "토"][selectedDate.getDay()]})`;

  return (
    <div className="tabPane dailyPage">
      <div className="paneHeaderRow">
        <h3 className="paneTitle">
          <ListTodo size={16} /> 오늘의 업무
        </h3>
      </div>
      <p className="dailyHint">나만 볼 수 있는 개인 할일 목록이에요. 팀원에게는 공유되지 않아요.</p>

      <div className="dailyLayout">
        <div className="dailyMain">
          <div className="dayNavRow">
            <button className="iconBtn" onClick={() => goDay(-1)}>
              <ChevronDown size={15} style={{ transform: "rotate(90deg)" }} />
            </button>
            <span className="dayNavLabel">{dateLabel}</span>
            <button className="iconBtn" onClick={() => goDay(1)}>
              <ChevronDown size={15} style={{ transform: "rotate(-90deg)" }} />
            </button>
          </div>
          {selectedIso === todayIso && (
            <div className="todayTagRow">
              <span className="weekNowTag">오늘</span>
            </div>
          )}

          <div className="dayDoneSummary">
            {doneCount}/{dayItems.length} 완료
          </div>

          <div className="composer">
            <input
              className="formInput grow"
              placeholder="이 날짜에 할 일 추가하고 Enter"
              value={quickAdd}
              onChange={(e) => setQuickAdd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
            />
            <button className="btnPrimary small" onClick={addItem} disabled={!quickAdd.trim()}>
              추가
            </button>
          </div>

          <div className="dailyItemList">
            {dayItems.length === 0 && <p className="mutedText">이 날짜에 등록된 할 일이 없어요.</p>}
            {dayItems.map((t) => (
              <div key={t.id} className="dailyItemRow">
                <label className="dailyItemCheck">
                  <input type="checkbox" checked={t.done} onChange={() => toggleItem(t.id)} />
                  <span
                    className={t.done ? "done" : ""}
                    contentEditable
                    suppressContentEditableWarning
                    onClick={(e) => e.preventDefault()}
                    onBlur={(e) => {
                      const text = e.currentTarget.textContent.trim();
                      if (text && text !== t.text) editItem(t.id, text);
                      else e.currentTarget.textContent = t.text;
                    }}
                  >
                    {t.text}
                  </span>
                </label>
                <button className="subtaskRemove" onClick={() => deleteItem(t.id)}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="dailySide">
          <div className="calendarCard">
            <div className="monthNavRow">
              <button className="monthTodayBtn" onClick={jumpToday}>
                오늘
              </button>
              <div className="monthNavCenter">
                <button className="iconBtn" onClick={() => goMonth(-1)}>
                  <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} />
                </button>
                <span className="monthNavLabel">
                  {viewMonth.getFullYear()}년 {viewMonth.getMonth() + 1}월
                </span>
                <button className="iconBtn" onClick={() => goMonth(1)}>
                  <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
                </button>
              </div>
            </div>

            <div className="calendarGrid">
              {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                  <div key={d} className="calendarWeekday">
                    {d}
                  </div>
                ))}
                {cells.map((d, i) => {
                  if (!d) return <div key={i} className="calendarCell empty" />;
                  const iso = isoDate(d);
                  const isToday = iso === todayIso;
                  const isSelected = iso === selectedIso;
                  return (
                    <button
                      key={i}
                      className={"calendarCell" + (isToday ? " today" : "") + (isSelected ? " selected" : "")}
                      onClick={() => pickDate(d)}
                    >
                      {d.getDate()}
                      {datesWithTasks.has(iso) && <span className="calendarDot" />}
                    </button>
                  );
                })}
              </div>

              <button className="monthBackupBtn" onClick={backupMonth}>
                <Download size={12} /> 이 달 백업
              </button>
            </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   HOME TAB -- the landing screen. Just an image the admin can
   swap out anytime; always normalized to 600x600 (cover-cropped)
   so it displays consistently regardless of the source image size.
   ============================================================ */
function HomeTab({ homeImage, updateHomeImage, isAdmin, notifications, updateNotifications }) {
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const triggerUpload = () => fileInputRef.current?.click();

  const dismissNotification = (id) => {
    updateNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const dismissAll = () => {
    const ids = new Set(notifications.map((n) => n.id));
    updateNotifications((prev) => prev.filter((n) => !ids.has(n.id)));
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);

    const img = new Image();
    const reader = new FileReader();
    reader.onload = (evt) => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 600;
        canvas.height = 600;
        const ctx = canvas.getContext("2d");
        // cover-fit crop so the source image always fills the 600x600 square
        const scale = Math.max(600 / img.width, 600 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (600 - w) / 2;
        const y = (600 - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        updateHomeImage(canvas.toDataURL("image/jpeg", 0.9));
        setBusy(false);
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="tabPane homePane">
      {notifications.length > 0 && (
        <div className="notifyPanel">
          <div className="notifyPanelHeader">
            <span>알림 {notifications.length}</span>
            <button className="btnGhost small" onClick={dismissAll}>
              모두 확인
            </button>
          </div>
          {[...notifications]
            .sort((a, b) => b.ts - a.ts)
            .map((n) => (
              <div className="notifyRow" key={n.id}>
                <span className="notifyIcon">{n.type === "announcement" ? "📢" : "💬"}</span>
                <span className="notifyMessage">{n.message}</span>
                <span className="notifyTime">{timeAgo(n.ts)}</span>
                <button className="btnGhost small" onClick={() => dismissNotification(n.id)}>
                  확인
                </button>
              </div>
            ))}
        </div>
      )}

      {isAdmin && (
        <div className="homeAdminBar">
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFile} style={{ display: "none" }} />
          <button className="btnGhost small" onClick={triggerUpload} disabled={busy}>
            <Upload size={13} /> {busy ? "처리 중..." : "홈 화면 이미지 변경 (600×600)"}
          </button>
        </div>
      )}

      <div className="homeImageBox">
        {homeImage ? (
          <img src={homeImage} alt="홈 화면" className="homeImage" />
        ) : (
          <div className="homeImagePlaceholder">
            <ImageIcon size={28} />
            <p>{isAdmin ? "위 버튼으로 홈 화면 이미지를 등록해주세요." : "등록된 홈 화면 이미지가 없어요."}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   ROOT APP
   ============================================================ */
export default function JetemaWorkspace() {
  const postsD = usePersisted(KEYS.posts, []);
  const projectsD = usePersisted(KEYS.projects, DEFAULT_PROJECTS);
  const tasksD = usePersisted(KEYS.tasks, []);
  const teamsD = usePersisted(KEYS.teams, DEFAULT_TEAMS);
  const usersD = usePersisted(KEYS.users, []);
  const announcementsD = usePersisted(KEYS.announcements, []);
  const weeklyTasksD = usePersisted(KEYS.weeklyTasks, []);
  const dailyTasksD = usePersisted(KEYS.dailyTasks, []);
  const homeImageD = usePersisted(KEYS.homeImage, null);
  const notificationsD = usePersisted(KEYS.notifications, []);

  const [session, setSession] = useState(null); // logged-in user object
  const [tab, setTab] = useState("home");
  const [projectsResetKey, setProjectsResetKey] = useState(0);
  const [weeklyResetKey, setWeeklyResetKey] = useState(0);

  // Clicking a nav tab always returns to that section's main card view,
  // even if a detail page (project / person) was open inside it.
  const selectTab = (next) => {
    if (next === "projects") setProjectsResetKey((k) => k + 1);
    if (next === "weekly") setWeeklyResetKey((k) => k + 1);
    setTab(next);
  };

  const domains = [postsD, projectsD, tasksD, teamsD, usersD, announcementsD, weeklyTasksD, dailyTasksD, homeImageD, notificationsD];
  const allLoaded = domains.every((d) => d.status !== "loading");
  const anyWarn = domains.some((d) => d.status === "warn");

  // keep the session's team list fresh if an admin edits permissions elsewhere
  const liveSessionUser = useMemo(() => {
    if (!session) return null;
    return usersD.value.find((u) => u.id === session.id) || session;
  }, [session, usersD.value]);

  const isAdmin = liveSessionUser?.role === "admin";
  const accessibleTeams = isAdmin ? teamsD.value : teamsD.value.filter((t) => liveSessionUser?.teams.includes(t));

  if (!allLoaded) {
    return (
      <div className="app">
        <style>{CSS}</style>
        <div className="loadingBar">
          <div className="spinner" /> 불러오는 중…
        </div>
      </div>
    );
  }

  if (!liveSessionUser) {
    return (
      <div className="app">
        <style>{CSS}</style>
        <AuthScreen
          users={usersD.value}
          updateUsers={usersD.update}
          teams={teamsD.value}
          onLogin={(u) => {
            setSession(u);
            setTab("home");
          }}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="topbar">
        <div className="brand">
          <img src={JETEMA_LOGO} alt="JETEMA" className="topbarLogoImg" />
          <span className="brandSub">Biomaterial Research Dept.</span>
        </div>


        <div className="whoAmI">
          <Users size={14} />
          <span>{liveSessionUser.name}</span>
          {isAdmin && <span className="adminTag">관리자</span>}
          <button className="iconBtn" onClick={() => setSession(null)} title="로그아웃">
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <div className="securityNotice">
        <AlertTriangle size={13} />
        보안을 위하여 연구 세부내용과 시험결과는 작성하지 않도록 주의부탁드립니다.
      </div>

      {anyWarn && (
        <>
          {postsD.status === "warn" && <WarnBanner reason={postsD.warnReason} onReset={postsD.clearAndReset} />}
          {projectsD.status === "warn" && <WarnBanner reason={projectsD.warnReason} onReset={projectsD.clearAndReset} />}
          {tasksD.status === "warn" && <WarnBanner reason={tasksD.warnReason} onReset={tasksD.clearAndReset} />}
          {teamsD.status === "warn" && <WarnBanner reason={teamsD.warnReason} onReset={teamsD.clearAndReset} />}
          {usersD.status === "warn" && <WarnBanner reason={usersD.warnReason} onReset={usersD.clearAndReset} />}
          {announcementsD.status === "warn" && (
            <WarnBanner reason={announcementsD.warnReason} onReset={announcementsD.clearAndReset} />
          )}
          {weeklyTasksD.status === "warn" && (
            <WarnBanner reason={weeklyTasksD.warnReason} onReset={weeklyTasksD.clearAndReset} />
          )}
          {dailyTasksD.status === "warn" && (
            <WarnBanner reason={dailyTasksD.warnReason} onReset={dailyTasksD.clearAndReset} />
          )}
          {homeImageD.status === "warn" && (
            <WarnBanner reason={homeImageD.warnReason} onReset={homeImageD.clearAndReset} />
          )}
        </>
      )}

      <nav className="tabs">
        <button className={"tabBtn" + (tab === "home" ? " active" : "")} onClick={() => selectTab("home")}>
          <Home size={15} /> 홈
        </button>
        <button className={"tabBtn" + (tab === "feed" ? " active" : "")} onClick={() => selectTab("feed")}>
          <Rss size={15} /> 공지
        </button>
        <button className={"tabBtn" + (tab === "projects" ? " active" : "")} onClick={() => selectTab("projects")}>
          <FolderKanban size={15} /> 프로젝트
        </button>
        <button className={"tabBtn" + (tab === "weekly" ? " active" : "")} onClick={() => selectTab("weekly")}>
          <Calendar size={15} /> 이번주 주요업무
        </button>
        <button className={"tabBtn" + (tab === "daily" ? " active" : "")} onClick={() => selectTab("daily")}>
          <ListTodo size={15} /> 오늘의 업무
        </button>
        {isAdmin && (
          <button className={"tabBtn" + (tab === "admin" ? " active" : "")} onClick={() => setTab("admin")}>
            <ShieldCheck size={15} /> 관리자
            {usersD.value.some((u) => u.status === "pending") && <span className="tabDot" />}
          </button>
        )}
      </nav>

      <main className="main">
        {tab === "home" && (
          <HomeTab
            homeImage={homeImageD.value}
            updateHomeImage={homeImageD.update}
            isAdmin={isAdmin}
            notifications={notificationsD.value.filter((n) => n.userId === liveSessionUser.id)}
            updateNotifications={notificationsD.update}
          />
        )}
        {tab === "feed" && (
          <FeedTab
            announcements={announcementsD.value}
            updateAnnouncements={announcementsD.update}
            currentUser={liveSessionUser}
            users={usersD.value.filter((u) => u.status === "approved")}
            updateNotifications={notificationsD.update}
          />
        )}
        {tab === "projects" && (
          <ProjectsTab
            key={projectsResetKey}
            projects={projectsD.value}
            updateProjects={projectsD.update}
            tasks={tasksD.value}
            updateTasks={tasksD.update}
            teams={teamsD.value}
            users={usersD.value.filter((u) => u.status === "approved")}
            currentUser={liveSessionUser}
            isAdmin={isAdmin}
            accessibleTeams={accessibleTeams}
            updateNotifications={notificationsD.update}
          />
        )}
        {tab === "weekly" && (
          <WeeklyTab
            key={weeklyResetKey}
            weeklyTasks={weeklyTasksD.value}
            updateWeeklyTasks={weeklyTasksD.update}
            users={usersD.value.filter((u) => u.status === "approved")}
            projects={projectsD.value}
            tasks={tasksD.value}
            updateTasks={tasksD.update}
            currentUser={liveSessionUser}
            isAdmin={isAdmin}
            updateNotifications={notificationsD.update}
          />
        )}
        {tab === "daily" && (
          <DailyTasksPanel
            dailyTasks={dailyTasksD.value}
            updateDailyTasks={dailyTasksD.update}
            currentUser={liveSessionUser}
          />
        )}
        {tab === "admin" && isAdmin && (
          <AdminTab
            users={usersD.value}
            updateUsers={usersD.update}
            teams={teamsD.value}
            updateTeams={teamsD.update}
            currentUser={liveSessionUser}
          />
        )}
      </main>
    </div>
  );
}

function NoTeamNotice() {
  return (
    <div className="tabPane">
      <div className="emptyState">
        <UserPlus size={22} />
        <p>아직 접근 권한이 있는 팀이 없어요. 관리자에게 팀 배정을 요청해주세요.</p>
      </div>
    </div>
  );
}

/* ============================================================
   STYLES
   ============================================================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap');

:root {
  --bg: #F2F5F8;
  --surface: #FFFFFF;
  --ink: #6D6E71;
  --ink-soft: #9B9C9F;
  --teal: #087FBE;
  --teal-deep: #3976BA;
  --coral: #FF6F4D;
  --line: #DCE3EA;
  --warn-bg: #FCEFE6;
  --warn-ink: #8A4B1F;
  --danger: #C23B3B;
  --tint: #E4EFF7;
}
* { box-sizing: border-box; }
.app {
  font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--ink);
  min-height: 100vh;
  padding-bottom: 40px;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

/* ---- auth screen ---- */
.authWrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
.authCard { background: var(--surface); border-radius: 14px; padding: 28px; width: 340px; box-shadow: 0 4px 24px rgba(8,127,190,0.12); display: flex; flex-direction: column; gap: 10px; }
.authBrand { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-bottom: 10px; }
.authLogoImg { height: 34px; width: auto; }
.authTabs { display: flex; background: var(--bg); border-radius: 9px; padding: 3px; margin-bottom: 4px; }
.authTabBtn { flex: 1; border: none; background: transparent; padding: 8px; border-radius: 7px; font-size: 13px; font-weight: 600; color: var(--ink-soft); cursor: pointer; }
.authTabBtn.active { background: var(--surface); color: var(--teal-deep); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.authNotice { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--teal-deep); background: var(--tint); padding: 7px 10px; border-radius: 7px; }
.authError { color: var(--danger); font-size: 12.5px; }
.authInfo { color: var(--teal-deep); font-size: 12.5px; }
.authHint { font-size: 12.5px; color: var(--ink-soft); margin: 0 0 2px; line-height: 1.5; }
.authHint strong { color: var(--ink); }
.authBackLink { background: transparent; border: none; color: var(--ink-soft); font-size: 12px; cursor: pointer; padding: 4px; align-self: center; }
.authBackLink:hover { color: var(--teal-deep); text-decoration: underline; }
.btnPrimary.full { width: 100%; justify-content: center; margin-top: 6px; }

.topbar {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 14px 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  z-index: 20;
  flex-wrap: wrap;
}
.brand { display: flex; align-items: center; gap: 10px; }
.topbarLogoImg { height: 26px; width: auto; flex-shrink: 0; }
.brandSub { font-size: 13px; font-weight: 700; color: var(--ink-soft); font-family: 'Noto Sans KR', sans-serif; }

.homePane { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.homeAdminBar { align-self: center; }
.notifyPanel {
  width: 100%; max-width: 600px; background: var(--bg); border-radius: 12px;
  padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;
}
.notifyPanelHeader { display: flex; align-items: center; justify-content: space-between; font-size: 12.5px; font-weight: 700; color: var(--ink-soft); }
.notifyRow { display: flex; align-items: center; gap: 8px; background: var(--surface); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; }
.notifyIcon { flex-shrink: 0; }
.notifyMessage { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notifyTime { flex-shrink: 0; font-size: 10.5px; color: var(--ink-soft); }
.homeImageBox {
  width: 600px; max-width: 100%; aspect-ratio: 1; border-radius: 12px; overflow: hidden;
  background: var(--bg); display: flex; align-items: center; justify-content: center;
}
.homeImage { width: 100%; height: 100%; object-fit: cover; display: block; }
.homeImagePlaceholder { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--ink-soft); text-align: center; padding: 20px; }
.homeImagePlaceholder p { font-size: 12.5px; margin: 0; }

.securityNotice {
  display: flex; align-items: center; gap: 8px; justify-content: center;
  background: var(--bg); color: var(--ink-soft); font-size: 12px; font-weight: 600;
  padding: 8px 16px; text-align: center; border-bottom: 1px solid var(--line);
}

.whoAmI { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink-soft); padding: 6px 10px; border-radius: 7px; }
.tabPane.dailyPage { max-width: 680px; margin: 0 auto; }
.dailyTitle { display: flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 800; }
.dailyHint { font-size: 11.5px; color: var(--ink-soft); margin: -4px 0 14px; line-height: 1.5; }

.dailyLayout { display: flex; gap: 22px; align-items: flex-start; }
.dailyMain { flex: 1; min-width: 0; }
.dailySide { width: 210px; flex-shrink: 0; display: flex; flex-direction: column; align-items: stretch; }

.calendarCard {
  background: var(--bg); border-radius: 12px; padding: 12px 12px 12px;
  display: flex; flex-direction: column; align-items: center; margin-top: 8px;
}
.monthNavRow { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-bottom: 8px; }
.monthNavCenter { display: flex; align-items: center; justify-content: center; gap: 8px; }
.monthNavCenter .iconBtn, .dayNavRow .iconBtn { margin-left: 0; }
.monthTodayBtn {
  border: none; background: var(--bg); color: var(--teal-deep); font-size: 10px; font-weight: 700;
  padding: 4px 10px; border-radius: 20px; cursor: pointer;
}
.monthTodayBtn:hover { background: var(--teal); color: #fff; }
.monthNavLabel { font-size: 12px; font-weight: 700; min-width: 64px; text-align: center; }

.calendarGrid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; width: 100%; margin: 0 auto; }
.calendarWeekday { text-align: center; font-size: 9px; font-weight: 700; color: var(--ink-soft); padding: 2px 0; }
.calendarCell {
  position: relative; width: 100%; aspect-ratio: 1; border: 1px solid transparent; background: transparent;
  border-radius: 7px; font-size: 10.5px; color: var(--ink); cursor: pointer; display: flex;
  align-items: center; justify-content: center;
}
.calendarCell:hover { background: var(--surface); }
.calendarCell.empty { cursor: default; }
.calendarCell.today { border-color: var(--teal); font-weight: 700; }
.calendarCell.selected { background: var(--teal); color: #fff; }
.calendarDot { position: absolute; bottom: 2px; width: 3px; height: 3px; border-radius: 50%; background: var(--coral); }
.calendarCell.selected .calendarDot { background: #fff; }

.monthBackupBtn {
  display: flex; align-items: center; justify-content: center; gap: 5px; margin-top: 10px; border: none;
  width: 100%; background: var(--surface); color: var(--teal-deep); font-size: 11px; font-weight: 700;
  padding: 7px 10px; border-radius: 20px; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.monthBackupBtn:hover { background: var(--teal); color: #fff; }


.dayNavRow { display: flex; align-items: center; justify-content: center; gap: 8px; }
.todayTagRow { display: flex; justify-content: center; margin-top: 4px; }
.dayNavLabel { font-size: 14.5px; font-weight: 700; }
.dayDoneSummary { font-size: 11.5px; color: var(--ink-soft); font-family: 'Noto Sans KR', sans-serif; margin: 6px 0 12px; }

.dailyItemList { display: flex; flex-direction: column; gap: 4px; }
.dailyItemRow { display: flex; align-items: flex-start; gap: 8px; padding: 8px 6px; border-radius: 7px; }
.dailyItemRow:hover { background: var(--bg); }
.dailyItemCheck { display: flex; align-items: flex-start; gap: 9px; font-size: 14px; flex: 1; min-width: 0; cursor: pointer; }
.dailyItemCheck input[type="checkbox"] { margin-top: 3px; flex-shrink: 0; }
.dailyItemCheck span { min-width: 0; word-break: break-word; overflow-wrap: break-word; line-height: 1.4; }
.dailyItemCheck .done { text-decoration: line-through; color: var(--ink-soft); }

.adminTag { background: var(--coral); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 5px; }

.loadingBar { display: flex; align-items: center; gap: 10px; justify-content: center; padding: 60px 20px; color: var(--ink-soft); font-size: 13px; }
.spinner { width: 16px; height: 16px; border: 2px solid var(--line); border-top-color: var(--teal); border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.warnBanner {
  display: flex; align-items: center; gap: 8px;
  background: var(--warn-bg); color: var(--warn-ink);
  padding: 9px 16px; font-size: 12.5px; margin: 10px 20px 0;
  border-radius: 8px;
}
.warnResetBtn {
  margin-left: auto; display: flex; align-items: center; gap: 4px;
  background: transparent; border: 1px solid var(--warn-ink); color: var(--warn-ink);
  padding: 3px 9px; border-radius: 6px; font-size: 11.5px; cursor: pointer;
}

.tabs { display: flex; gap: 4px; padding: 14px 20px 0; }
.tabBtn {
  display: flex; align-items: center; gap: 6px;
  border: none; background: transparent; color: var(--ink-soft);
  padding: 9px 16px; border-radius: 8px 8px 0 0; font-size: 13px; font-weight: 600; cursor: pointer;
  position: relative;
}
.tabBtn.active { background: var(--surface); color: var(--teal-deep); }
.tabDot { width: 7px; height: 7px; border-radius: 50%; background: var(--coral); position: absolute; top: 6px; right: 6px; }

.main { padding: 0 20px; max-width: 1180px; margin: 0 auto; }
.tabPane { background: var(--surface); border-radius: 0 10px 10px 10px; padding: 20px; margin-top: -1px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); max-width: 820px; margin-left: auto; margin-right: auto; }

.composer { display: flex; gap: 8px; margin-bottom: 18px; align-items: flex-start; }
.composerInput {
  flex: 1; width: 100%; resize: none; border: 1px solid var(--line); border-radius: 8px;
  padding: 10px 12px; font-size: 13.5px; font-family: inherit; min-height: 40px; max-height: 240px;
}
.composerInput:focus { outline: none; border-color: var(--teal); }

.btnPrimary {
  background: var(--teal); color: #fff; border: none; border-radius: 8px;
  padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; gap: 5px; white-space: nowrap;
}
.btnPrimary:disabled { opacity: 0.4; cursor: default; }
.btnPrimary.small { padding: 6px 11px; font-size: 12px; }
.btnGhost { background: transparent; border: 1px solid var(--line); color: var(--ink-soft); border-radius: 8px; padding: 10px 12px; cursor: pointer; }
.btnGhost.small { padding: 6px 11px; font-size: 12px; }
.btnDangerSmall { background: var(--danger); color: #fff; border: none; border-radius: 7px; padding: 6px 11px; font-size: 12px; cursor: pointer; }

.emptyState { text-align: center; padding: 40px 20px; color: var(--ink-soft); display: flex; flex-direction: column; align-items: center; gap: 8px; }
.emptyState p { font-size: 13px; margin: 0; }

.announcePanel { margin-bottom: 22px; padding-bottom: 18px; border-bottom: 1px dashed var(--line); }
.announceHeaderRow { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 10px; flex-wrap: wrap; }
.announceList { display: flex; flex-direction: column; gap: 10px; }
.announceCard { border: 1px solid var(--line); background: var(--surface); border-radius: 10px; overflow: hidden; }
.announceComposer { flex-direction: column; align-items: stretch; }
.announceComposerActions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.importantCheck { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--coral); font-weight: 600; cursor: pointer; }
.announceDateInput { font-size: 12px; padding: 7px 10px; }
.announceCard.important { border-color: var(--coral); background: #FFEEE8; }
.importantDot { color: var(--coral); font-size: 13px; flex-shrink: 0; }
.importantToggleBtn {
  display: flex; align-items: center; gap: 4px; border: 1px solid var(--line); background: #fff;
  color: var(--ink-soft); border-radius: 7px; padding: 5px 10px; font-size: 11.5px; cursor: pointer; margin-left: auto;
}
.importantToggleBtn.on { color: var(--coral); border-color: var(--coral); background: #FFEEE8; }
.announceRow {
  width: 100%; display: flex; align-items: center; gap: 10px;
  background: transparent; border: none; padding: 11px 14px; cursor: pointer; text-align: left;
}
.announceRowDate {
  display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700;
  color: var(--ink-soft); font-family: 'Noto Sans KR', sans-serif; flex-shrink: 0;
}
.announceCard.important .announceRowDate { color: var(--coral); }
.announceRowAuthor { font-size: 12px; font-weight: 700; color: var(--ink); flex-shrink: 0; }
.announceRowPreview {
  flex: 1; font-size: 13px; color: var(--ink); overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; min-width: 0;
}
.announceRowCommentCount { font-size: 11px; color: var(--ink-soft); flex-shrink: 0; }
.announceRowToggle {
  display: flex; align-items: center; gap: 2px; font-size: 11.5px; font-weight: 600;
  color: var(--ink-soft); flex-shrink: 0;
}
.announceDetail { padding: 0 16px 14px; border-top: 1px solid rgba(232,103,74,0.25); padding-top: 12px; }

.announceDate { display: flex; align-items: center; gap: 4px; font-size: 10.5px; color: var(--ink-soft); font-family: 'Noto Sans KR', sans-serif; }
.announceClock { color: var(--ink-soft); }
.editedTag { color: var(--ink-soft); }
.editBox { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
.editActions { display: flex; gap: 6px; }
.feedDivider { display: flex; align-items: center; gap: 10px; margin: 4px 0 16px; }
.feedDivider span { font-size: 11.5px; font-weight: 700; color: var(--ink-soft); white-space: nowrap; }
.feedDivider::after { content: ""; flex: 1; height: 1px; background: var(--line); }

.feedList { display: flex; flex-direction: column; gap: 14px; }
.postCard { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
.postHeader { display: flex; align-items: center; gap: 9px; }
.avatar {
  width: 30px; height: 30px; border-radius: 50%; background: var(--teal);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; flex-shrink: 0;
}
.postMeta { display: flex; flex-direction: column; line-height: 1.2; }
.postAuthor { font-size: 13px; font-weight: 700; }
.postTime { font-size: 10.5px; color: var(--ink-soft); font-family: 'Noto Sans KR', sans-serif; }
.iconBtn { margin-left: auto; background: transparent; border: none; color: var(--ink-soft); cursor: pointer; padding: 4px; }
.iconBtn.danger { color: var(--danger); }
.iconBtn.danger:disabled { opacity: 0.3; cursor: default; }
.postText { font-size: 13.5px; line-height: 1.55; margin-top: 8px; white-space: pre-wrap; }

.commentSection { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.commentRow { display: flex; gap: 8px; }
.commentMeta { display: flex; gap: 6px; align-items: baseline; }
.commentAuthor { font-size: 11.5px; font-weight: 700; }
.commentTime { font-size: 10px; color: var(--ink-soft); font-family: 'Noto Sans KR', sans-serif; }
.commentText { font-size: 12.5px; line-height: 1.5; }
.commentComposer { display: flex; gap: 6px; margin-top: 4px; }
.commentInput { flex: 1; border: 1px solid var(--line); border-radius: 20px; padding: 7px 13px; font-size: 12.5px; }
.commentInput:focus { outline: none; border-color: var(--teal); }

.paneHeaderRow { display: flex; align-items: center; margin-bottom: 14px; }
.paneTitle { font-size: 14px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 7px; }
.paneHeaderRow .btnPrimary { margin-left: auto; }

.inlineForm { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.formInput { border: 1px solid var(--line); border-radius: 8px; padding: 9px 12px; font-size: 13px; font-family: inherit; }
.formInput.grow { flex: 1; min-width: 160px; }
.formSelect { border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; font-size: 12.5px; font-family: inherit; background: #fff; }

.teamGroup { margin-bottom: 24px; }
.teamGroupHeader { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; margin-bottom: 10px; }

.projCardGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.projCard {
  border: 1.5px solid var(--ink-soft); border-radius: 10px; background: var(--surface);
  padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; cursor: grab;
}
.projCard:active { cursor: grabbing; }
.projCard.locked { background: var(--bg); opacity: 0.75; cursor: default; }
.projCard.locked .dragHandle { visibility: hidden; }
.projCardTop { display: flex; align-items: center; gap: 5px; }
.dragHandle { color: var(--ink-soft); flex-shrink: 0; cursor: grab; }
.projTeamBadge {
  border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; font-size: 11px;
  font-weight: 600; color: var(--ink-soft); background: var(--bg); max-width: 64px;
}
.projIconBtn {
  border: none; background: var(--bg); color: var(--ink); border-radius: 6px;
  padding: 5px; cursor: pointer; display: flex; margin-left: auto;
}
.projIconBtn.danger { color: var(--danger); margin-left: 2px; }
.projIconBtn:not(.danger) + .projIconBtn:not(.danger) { margin-left: 4px; }
.projIconBtn + .projIconBtn.danger { margin-left: 2px; }
.projDeleteConfirm { display: flex; gap: 4px; margin-left: auto; }
.projCardBody { display: flex; flex-direction: column; gap: 3px; cursor: pointer; }
.projColorDot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-bottom: 2px; }
.projCardTitle { font-size: 13.5px; font-weight: 700; line-height: 1.35; }
.projCardMeta { font-size: 11.5px; color: var(--ink-soft); }
.projCardAssignee { display: flex; align-items: center; gap: 4px; font-size: 10.5px; color: var(--ink-soft); font-family: 'Noto Sans KR', sans-serif; }
.projAccessTag { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--coral); }
.weeklyPersonCard { align-items: center; text-align: center; cursor: pointer; padding: 18px 12px; }
.weeklyAvatar {
  width: 44px; height: 44px; border-radius: 50%; color: #fff; font-weight: 800; font-size: 16px;
  display: flex; align-items: center; justify-content: center; margin-bottom: 8px;
}
.weeklyAvatar.small { width: 26px; height: 26px; font-size: 12px; margin-bottom: 0; }

.weekNavRow { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 0; border-top: 1px solid var(--line); flex-wrap: wrap; }
.weekNavLabel { font-size: 12.5px; font-weight: 700; }
.weekNowTag { background: var(--tint); color: var(--teal-deep); font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 20px; }
.weekNowBtn { background: var(--bg); color: var(--ink-soft); border: none; font-size: 10.5px; font-weight: 700; padding: 4px 9px; border-radius: 20px; cursor: pointer; }
.weekDoneSummary { font-size: 11.5px; color: var(--ink-soft); font-family: 'Noto Sans KR', sans-serif; }
.weeklyStatusBtn { margin-left: 0; margin-bottom: 4px; }
.linkedTaskRow { display: flex; gap: 8px; }
.linkedTaskRow .formSelect.grow { flex: 1; min-width: 0; }

.projCardAdd {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  color: var(--ink-soft); background: var(--bg); border: 1px dashed var(--line); cursor: pointer;
  min-height: 88px; font-size: 12px; font-weight: 600;
}

.modalCard.projModal { width: 420px; max-height: 85vh; overflow-y: auto; }
.modalCard.taskBoard { width: 620px; }
.projModalTitle { font-size: 14.5px; font-weight: 800; display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--ink-soft); }
.projModalTitle:hover { color: var(--ink); }
.accessToggle {
  display: flex; align-items: center; gap: 6px; align-self: flex-start;
  background: var(--bg); border: none; border-radius: 7px; padding: 6px 10px;
  font-size: 11.5px; color: var(--ink-soft); cursor: pointer;
}
.projFeedSection { border-top: 1px solid var(--line); padding-top: 14px; }
.projDescSection { margin: 10px 0 16px; }
.projModalRow { display: flex; gap: 8px; }
.projModalSection { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 2px; }
.projModalLabel { font-size: 11.5px; font-weight: 700; color: var(--ink-soft); margin-bottom: 8px; }
.projModalFooter { border-top: 1px solid var(--line); padding-top: 12px; display: flex; align-items: center; gap: 8px; }

.taskBoardToolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-top: 1px solid var(--line); padding-top: 12px; margin-bottom: 16px; }
.statusTabs { display: flex; gap: 4px; background: var(--bg); padding: 3px; border-radius: 8px; }
.statusTab { display: flex; align-items: center; gap: 5px; border: none; background: transparent; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--ink-soft); cursor: pointer; }
.statusTab.active { background: var(--surface); color: var(--teal-deep); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.taskSearch { max-width: 160px; }
.quickAddRow { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; }
.itemTypeToggle { display: flex; gap: 4px; background: var(--bg); padding: 3px; border-radius: 8px; flex-shrink: 0; }
.itemTypeBtn {
  display: flex; align-items: center; gap: 4px; border: none; background: transparent;
  padding: 6px 10px; border-radius: 6px; font-size: 11.5px; font-weight: 600; color: var(--ink-soft); cursor: pointer;
}
.itemTypeBtn.active { background: var(--surface); color: var(--teal-deep); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.statusPill.memo { background: #EFE8FB; color: #6B46C1; }
.memoCard { border-color: #D9C9F5; background: #FCFAFF; }

.taskCardList { display: flex; flex-direction: column; gap: 10px; }
.taskCard { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.taskCardTop { display: flex; align-items: center; gap: 8px; }
.weeklyDetailTop { justify-content: flex-start; }
.weeklyDetailTop .noAutoMargin { margin-left: 0; }
.weeklyDetailTop .iconBtn { margin-left: 6px; }
.statusPill { font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 20px; background: var(--tint); color: var(--teal-deep); }
.statusPill.done { background: var(--bg); color: var(--ink-soft); }
.taskUpdatedMeta { font-size: 10.5px; color: var(--ink-soft); font-family: 'Noto Sans KR', sans-serif; margin-left: 6px; }
.taskTopRightActions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.taskTopRightActions .iconBtn, .taskTopRightActions .projDeleteConfirm { margin-left: 0; }
.expandToggleBtn {
  display: flex; align-items: center; gap: 3px; border: 1px solid var(--line); background: var(--bg);
  color: var(--ink); border-radius: 7px; padding: 5px 10px; font-size: 11.5px; font-weight: 600; cursor: pointer;
}
.expandToggleBtn:hover { border-color: var(--teal); color: var(--teal-deep); background: var(--tint); }
.taskCardTitle { font-size: 14px; font-weight: 700; outline: none; border-radius: 6px; padding: 2px 4px; margin: -2px -4px; }
.taskCardTitle:focus { background: var(--bg); }
.taskCardFieldsRow { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.taskFieldLabel { display: flex; flex-direction: column; gap: 3px; font-size: 10.5px; color: var(--ink-soft); font-weight: 600; }
.taskFieldLabel.block { margin-top: 4px; }
.taskFieldLabel .formSelect, .taskFieldLabel .formInput { min-width: 100px; }
.assigneeSelectWrap { position: relative; }
.assigneeSelectBtn { cursor: pointer; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
.assigneeDropdown {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 20;
  background: var(--surface); border: 1px solid var(--line); border-radius: 8px;
  padding: 8px 10px; box-shadow: 0 4px 14px rgba(0,0,0,0.12); display: flex;
  flex-direction: column; gap: 6px; min-width: 140px; max-height: 200px; overflow-y: auto;
}
.statusToggleBtn {
  display: flex; align-items: center; gap: 5px; border: 1px solid var(--line); background: #fff;
  color: var(--ink-soft); border-radius: 7px; padding: 7px 10px; font-size: 11.5px; cursor: pointer; margin-left: auto;
}
.subtaskList { display: flex; flex-direction: column; gap: 4px; }
.subtaskRow { display: flex; align-items: center; gap: 8px; }
.subtaskCheck { display: flex; align-items: center; gap: 8px; font-size: 13px; flex: 1; cursor: pointer; }
.subtaskCheck .done { text-decoration: line-through; color: var(--ink-soft); }
.subtaskRemove { background: transparent; border: none; color: var(--ink-soft); cursor: pointer; padding: 3px; flex-shrink: 0; }

.tabPane.projPage { max-width: 1140px; }
.projPageHeader { margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; }
.minorActions { display: flex; gap: 4px; }
.minorIconBtn {
  border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft);
  border-radius: 6px; padding: 5px; cursor: pointer; display: flex; opacity: 0.75;
}
.minorIconBtn:hover { opacity: 1; border-color: var(--teal); color: var(--teal-deep); }
.backBtn {
  display: flex; align-items: center; gap: 4px; background: transparent; border: none;
  color: var(--ink-soft); font-size: 12.5px; font-weight: 600; cursor: pointer; padding: 4px 0;
}
.backBtn:hover { color: var(--teal-deep); }
.projPageTitleRow { border: none; padding: 0; margin-bottom: 6px; }
.projPageTitle { font-size: 18px; display: flex; align-items: center; gap: 8px; }
.projPageTitle .projColorDot { width: 10px; height: 10px; background: var(--teal); }

.viewSwitch { display: flex; gap: 4px; background: var(--bg); padding: 3px; border-radius: 8px; }
.viewSwitchBtn {
  display: flex; align-items: center; gap: 5px; border: none; background: transparent;
  padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--ink-soft); cursor: pointer;
}
.viewSwitchBtn.active { background: var(--surface); color: var(--teal-deep); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.importBanner {
  display: flex; align-items: center; gap: 8px; background: var(--tint); color: var(--teal-deep);
  padding: 8px 14px; border-radius: 8px; font-size: 12.5px; margin-bottom: 4px;
}
.importBanner.error { background: var(--warn-bg); color: var(--warn-ink); }
.importBanner .iconBtn { margin-left: auto; padding: 2px; }

.growWrap {
  display: grid;
  width: 100%;
}
.growWrap::after {
  content: attr(data-value) " ";
  white-space: pre-wrap;
  word-wrap: break-word;
  visibility: hidden;
  grid-area: 1 / 1 / 2 / 2;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid transparent;
  font-size: 13.5px;
  font-family: inherit;
  line-height: normal;
  min-height: 40px;
}
.growWrap > textarea {
  grid-area: 1 / 1 / 2 / 2;
  width: 100%;
  height: 100%;
}
.autoGrow { resize: none; overflow: hidden; max-height: none; }

.ganttWrap { padding-top: 4px; }
.ganttToolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.ganttRangeLabel { font-size: 11px; color: var(--ink-soft); font-family: 'Noto Sans KR', sans-serif; }
.ganttScroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; }
.ganttInner { min-width: 100%; }
.ganttHeaderRow { display: flex; align-items: stretch; border-bottom: 1px solid var(--line); background: var(--bg); position: sticky; top: 0; z-index: 4; }
.ganttLabelHead { display: flex; align-items: center; font-weight: 700; font-size: 11.5px; color: var(--ink-soft); background: var(--bg); }
.ganttHeaderTrackWrap { display: flex; flex-direction: column; }
.ganttYearRow { position: relative; height: 20px; border-bottom: 1px solid var(--line); }
.ganttYearCol {
  position: absolute; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center;
  font-size: 10.5px; font-weight: 700; color: var(--ink-soft); border-left: 1px solid var(--line);
}
.ganttRow { display: flex; align-items: center; border-bottom: 1px solid var(--line); }
.ganttRow:last-child { border-bottom: none; }
.ganttLabel {
  width: 220px; flex-shrink: 0; font-size: 12.5px; font-weight: 600; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; padding: 8px 12px; position: sticky; left: 0;
  background: var(--surface); border-right: 1px solid var(--line); z-index: 3;
}
.ganttHeaderTrack { position: relative; height: 32px; background: var(--bg); }
.ganttPeriodCol {
  position: absolute; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; color: var(--ink-soft); border-left: 1px solid var(--line);
}
.ganttTrack { position: relative; height: 40px; }
.ganttGridLine { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--line); }
.ganttTodayLine { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--coral); z-index: 2; }
.ganttBar { position: absolute; top: 10px; height: 20px; background: var(--teal); border-radius: 4px; min-width: 6px; z-index: 1; }
.ganttBar.done { background: var(--ink-soft); }
.ganttNoDate { position: absolute; top: 11px; left: 8px; font-size: 11px; color: var(--ink-soft); }
.ganttCategoryRow {
  font-size: 11px; font-weight: 700; color: var(--teal-deep); background: var(--tint);
  padding: 5px 12px; border-bottom: 1px solid var(--line);
}

.taskList { display: flex; flex-direction: column; gap: 6px; }
.taskRow { display: flex; align-items: flex-start; gap: 10px; padding: 10px 8px; border-radius: 8px; cursor: pointer; }
.taskRow:hover { background: var(--bg); }
.taskRow.done .taskText { text-decoration: line-through; color: var(--ink-soft); }
.taskCheck { color: var(--ink-soft); flex-shrink: 0; margin-top: 1px; }
.taskCheck.done { color: var(--teal); }
.taskBody { display: flex; flex-direction: column; gap: 2px; }
.taskText { font-size: 13.5px; }
.taskSub { display: flex; gap: 8px; font-size: 10.5px; color: var(--ink-soft); font-family: 'Noto Sans KR', sans-serif; }
.taskProject::before { content: "# "; }

/* ---- admin tab ---- */
.adminSection { margin-bottom: 26px; padding-bottom: 22px; border-bottom: 1px solid var(--line); }
.adminSection:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.mutedText { color: var(--ink-soft); font-size: 12.5px; }
.countBadge { background: var(--coral); color: #fff; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 10px; }

.pendingRow, .memberRow {
  display: flex; align-items: center; gap: 14px; padding: 11px 4px; border-bottom: 1px solid var(--line); flex-wrap: wrap;
}
.memberRow:last-child, .pendingRow:last-child { border-bottom: none; }
.memberIdent { display: flex; align-items: center; gap: 9px; min-width: 150px; }
.memberName { font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
.youTag { font-size: 10px; font-weight: 600; color: var(--teal-deep); background: var(--tint); padding: 1px 6px; border-radius: 5px; }
.memberUsername { font-size: 11px; color: var(--ink-soft); font-family: 'Noto Sans KR', sans-serif; }

.memberTeams { display: flex; gap: 10px; flex-wrap: wrap; }
.teamCheck { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--ink-soft); cursor: pointer; }

.pendingActions { display: flex; gap: 6px; margin-left: auto; }
.deleteConfirmRow { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-left: auto; }

.roleBtn {
  display: flex; align-items: center; gap: 5px; border: 1px solid var(--line); background: #fff;
  color: var(--ink-soft); border-radius: 7px; padding: 6px 10px; font-size: 11.5px; cursor: pointer; margin-left: auto;
}
.roleBtn.isAdmin { color: var(--coral); border-color: var(--coral); }
.weeklyPermBtn {
  display: flex; align-items: center; gap: 5px; border: 1px solid var(--line); background: #fff;
  color: var(--ink-soft); border-radius: 7px; padding: 6px 10px; font-size: 11.5px; cursor: pointer;
}
.weeklyPermBtn.on { color: var(--teal-deep); border-color: var(--teal); background: var(--tint); }
.weeklyPermPanel { background: var(--bg); border-radius: 8px; padding: 12px 14px; margin: 0 4px 10px; }
.pwResetBtn {
  border: 1px solid var(--line); background: #fff; color: var(--ink-soft);
  border-radius: 7px; padding: 6px 10px; font-size: 11.5px; cursor: pointer;
}
.pwResetBtn:hover { border-color: var(--teal); color: var(--teal-deep); }
.roleBtn:disabled { opacity: 0.4; cursor: default; }

.teamChipRow { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 4px; }
.teamChip { background: var(--bg); color: var(--teal-deep); font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 20px; }

.modalOverlay { position: fixed; inset: 0; background: rgba(16,38,42,0.35); display: flex; align-items: center; justify-content: center; z-index: 50; }
.modalCard { background: #fff; border-radius: 12px; padding: 20px; width: 300px; display: flex; flex-direction: column; gap: 12px; }
.modalHeader { display: flex; align-items: center; justify-content: space-between; font-size: 13.5px; font-weight: 700; }

@media (max-width: 640px) {
  .topbar { padding: 10px 14px; gap: 10px; }
  .brandSub { display: none; }
  .whoAmI span:not(.adminTag) { display: none; }
  .main { padding: 0 10px; }
  .tabPane { padding: 16px 14px; }

  /* scrollable tab bar instead of wrapping/cramming */
  .tabs {
    padding: 10px 10px 0; gap: 4px; flex-wrap: nowrap; overflow-x: auto;
    -webkit-overflow-scrolling: touch; scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tabBtn { flex-shrink: 0; white-space: nowrap; font-size: 12.5px; padding: 9px 12px; }

  .memberRow, .pendingRow { flex-direction: column; align-items: flex-start; }
  .roleBtn, .pendingActions, .deleteConfirmRow { margin-left: 0; }
  .dailyLayout { flex-direction: column; }
  .dailySide { width: 100%; }
  .tabPane.dailyPage { max-width: 100%; }

  /* bigger, easier tap targets */
  .iconBtn, .projIconBtn, .minorIconBtn, .subtaskRemove { padding: 8px; }
  .btnPrimary, .btnGhost, .btnPrimary.small, .btnGhost.small { padding: 9px 14px; font-size: 13px; }
  .calendarCell { height: auto; font-size: 12px; }

  /* project detail / task board */
  .modalCard.projModal, .modalCard.taskBoard { width: 94vw; max-width: 94vw; }
  .taskBoardToolbar { gap: 10px; }
  .statusTabs { flex-wrap: wrap; }
  .taskSearch { max-width: 100%; width: 100%; margin-top: 6px; }
  .viewSwitch { flex-wrap: wrap; }
  .quickAddRow { flex-wrap: wrap; }
  .itemTypeToggle { width: 100%; }
  .quickAddRow .formInput.grow { min-width: 100%; order: 3; }
  .taskCardFieldsRow { gap: 8px 12px; }
  .taskCardFieldsRow .taskFieldLabel { flex: 1 1 44%; min-width: 120px; }
  .taskUpdatedMeta { font-size: 10px; }

  /* project cards */
  .projCardGrid { grid-template-columns: 1fr; }
  .teamGroupHeader { font-size: 13px; }

  /* weekly / gantt */
  .ganttLabel { width: 140px; }
  .weekNavRow { justify-content: center; }
  .weekDoneSummary { width: 100%; margin-left: 0; text-align: center; margin-top: 4px; }

  /* admin */
  .memberTeams { gap: 8px 12px; }
  .weeklyPermPanel { margin: 0 0 10px; }

  /* home */
  .homeImageBox { width: 100%; }

  .securityNotice { font-size: 11px; padding: 7px 12px; }

  /* general text scale-down for mobile readability */
  .projPageTitle { font-size: 15px; }
  .dailyTitle { font-size: 13.5px; }
  .dayNavLabel { font-size: 13px; }
  .monthNavLabel { font-size: 11.5px; }
  .paneTitle { font-size: 13px; }
  .postText { font-size: 13px; }
  .taskCardTitle { font-size: 13px; }
  .projCardTitle { font-size: 13px; }
  .commentText { font-size: 12px; }
  .authLogoImg { height: 28px; }
}
`;
