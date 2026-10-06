"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Chat({ user }) {
  const s = createClient();

  const [groups, setGroups] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");

  const [newGroup, setNewGroup] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  async function loadGroups() {
    const { data, error } = await s
      .from("group_members")
      .select("group_id,groups(id,name,invite_code)")
      .eq("user_id", user.id);

    if (error) {
      console.error(error);
      return;
    }

    setGroups(
      (data || [])
        .map((x) => x.groups)
        .filter(Boolean)
    );
  }

  async function loadMessages(id) {
    const { data, error } = await s
      .from("messages")
      .select(
        "id,user_id,content,created_at,profiles(username)"
      )
      .eq("group_id", id)
      .order("created_at");

    if (error) {
      console.error(error);
      return;
    }

    setMessages(data || []);
  }

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    if (!active) return;

    loadMessages(active.id);

    const ch = s
      .channel("messages-" + active.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "group_id=eq." + active.id,
        },
        () => {
          loadMessages(active.id);
        }
      )
      .subscribe();

    return () => {
      s.removeChannel(ch);
    };
  }, [active]);

  async function send(e) {
    e.preventDefault();

    if (!text.trim() || !active) return;

    const { error } = await s.from("messages").insert({
      group_id: active.id,
      user_id: user.id,
      content: text.trim(),
    });

    if (error) {
      alert(error.message);
      return;
    }

    setText("");
  }

  async function create(e) {
    e.preventDefault();

    if (!newGroup.trim()) return;

    const { error } = await s.rpc("create_chat_group", {
      group_name: newGroup.trim(),
    });

    if (error) {
      alert(error.message);
      return;
    }

    setNewGroup("");
    await loadGroups();
  }

  async function joinGroup(e) {
    e.preventDefault();

    if (!inviteCode.trim()) return;

    const { error } = await s.rpc("join_chat_group", {
      group_invite_code: inviteCode.trim(),
    });

    if (error) {
      alert(error.message);
      return;
    }

    setInviteCode("");
    await loadGroups();

    alert("Group joined successfully!");
  }

  async function logout() {
    await s.auth.signOut();
    location.reload();
  }

  return (
    <main className="container">
      <div className="topbar">
        <div>
          <h1>💬 FriendChat</h1>
          <span className="small">{user.email}</span>
        </div>

        <button onClick={logout}>Logout</button>
      </div>

      <div className="chat-layout">
        <aside className="card sidebar">

          {/* CREATE GROUP */}
          <form onSubmit={create}>
            <input
              placeholder="New group name"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
            />

            <button type="submit">
              Create Group
            </button>
          </form>

          {/* JOIN GROUP */}
          <form onSubmit={joinGroup} style={{ marginTop: "12px" }}>
            <input
              placeholder="Enter invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />

            <button type="submit">
              Join Group
            </button>
          </form>

          <h3>Your Groups</h3>

          {groups.length === 0 ? (
            <p className="small">
              No groups yet.
            </p>
          ) : (
            groups.map((g) => (
              <div
                className={
                  "group " +
                  (active?.id === g.id ? "active" : "")
                }
                key={g.id}
                onClick={() => setActive(g)}
              >
                {g.name}
              </div>
            ))
          )}
        </aside>

        <section className="card">
          {!active ? (
            <>
              <h2>Welcome 👋</h2>
              <p>
                Create a group or join one using an invite code.
              </p>
            </>
          ) : (
            <>
              <div className="topbar">
                <div>
                  <h2>{active.name}</h2>

                  <span className="small">
                    Invite Code: <b>{active.invite_code}</b>
                  </span>
                </div>
              </div>

              <div className="messages">
                {messages.map((m) => (
                  <div className="message" key={m.id}>
                    <b>
                      {m.profiles?.username || "User"}
                    </b>

                    <div>{m.content}</div>

                    <span className="small">
                      {new Date(
                        m.created_at
                      ).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              <form
                className="composer"
                onSubmit={send}
              >
                <input
                  placeholder="Write a message..."
                  value={text}
                  onChange={(e) =>
                    setText(e.target.value)
                  }
                />

                <button type="submit">
                  Send
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}