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

  async function loadGroups() {
    const { data, error } = await s
      .from("group_members")
      .select("group_id, groups(id, name, invite_code)")
      .eq("user_id", user.id);

    if (error) {
      console.error("Load groups error:", error);
      return;
    }

    setGroups(
      (data || [])
        .map((x) => x.groups)
        .filter(Boolean)
    );
  }

  async function loadMessages(id) {
    if (!id) {
      setMessages([]);
      return;
    }

    const { data, error } = await s
      .from("messages")
      .select("id, user_id, content, created_at")
      .eq("group_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Load messages error:", error);
      return;
    }

    setMessages(data || []);
  }

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    if (!active) {
      setMessages([]);
      return;
    }

    loadMessages(active.id);

    const channel = s
      .channel(`messages-${active.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `group_id=eq.${active.id}`,
        },
        (payload) => {
          setMessages((current) => {
            if (current.some((m) => m.id === payload.new.id)) {
              return current;
            }

            return [...current, payload.new];
          });
        }
      )
      .subscribe();

    return () => {
      s.removeChannel(channel);
    };
  }, [active?.id]);

  async function send(e) {
    e.preventDefault();

    if (!text.trim() || !active) return;

    const message = text.trim();
    setText("");

    const { data, error } = await s
      .from("messages")
      .insert({
        group_id: active.id,
        user_id: user.id,
        content: message,
      })
      .select("id, user_id, content, created_at")
      .single();

    if (error) {
      console.error("Send message error:", error);
      setText(message);
      return;
    }

    if (data) {
      setMessages((current) => {
        if (current.some((m) => m.id === data.id)) {
          return current;
        }

        return [...current, data];
      });
    }
  }

  async function create(e) {
    e.preventDefault();

    if (!newGroup.trim()) return;

    const { data, error } = await s.rpc("create_chat_group", {
      group_name: newGroup.trim(),
    });

    if (error) {
      alert(error.message);
      return;
    }

    setNewGroup("");
    await loadGroups();

    if (data) {
      const { data: createdGroup } = await s
        .from("groups")
        .select("id, name, invite_code")
        .eq("id", data)
        .single();

      if (createdGroup) {
        setActive(createdGroup);
      }
    }
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
          <h3>FRIENDS</h3>

          <form onSubmit={create}>
            <input
              placeholder="New group name"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
            />
            <button type="submit">+ Create Group</button>
          </form>

          <h3>Your Groups</h3>

          {groups.map((g) => (
            <div
              key={g.id}
              className={active?.id === g.id ? "group active" : "group"}
              onClick={() => setActive(g)}
            >
              {g.name}
            </div>
          ))}
        </aside>

        <section className="card">
          {!active ? (
            <>
              <div className="topbar">
                <h2>Welcome 👋</h2>
              </div>

              <p>Select or create a group.</p>
            </>
          ) : (
            <>
              <div className="topbar">
                <h2>{active.name}</h2>
                <span className="small">
                  Invite: {active.invite_code}
                </span>
              </div>

              <div className="messages">
                {messages.map((m) => (
                  <div className="message" key={m.id}>
                    <span className="small">
                      {m.user_id === user.id ? "You" : "User"}
                    </span>

                    <div>{m.content}</div>

                    <span className="small">
                      {m.created_at
                        ? new Date(m.created_at).toLocaleString()
                        : ""}
                    </span>
                  </div>
                ))}
              </div>

              <form className="composer" onSubmit={send}>
                <input
                  placeholder="Write a message..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />

                <button type="submit">Send</button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}