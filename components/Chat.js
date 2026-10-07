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

  const [username, setUsername] = useState("");
  const [nameInput, setNameInput] = useState("");

  const [profiles, setProfiles] = useState({});

  const [notificationPermission, setNotificationPermission] =
    useState("default");

  // -----------------------------
  // LOAD USERNAME
  // -----------------------------
  async function loadUsername() {
    const { data, error } = await s
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Profile error:", error);
      return;
    }

    if (data?.username && data.username !== "User") {
      setUsername(data.username);
      setNameInput(data.username);
    }
  }

  // -----------------------------
  // ENABLE NOTIFICATIONS
  // -----------------------------
  async function enableNotifications() {
    if (!("Notification" in window)) {
      alert("Your browser does not support notifications.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();

      setNotificationPermission(permission);

      if (permission === "granted") {
        new Notification("FriendChat", {
          body: "Notifications are enabled!",
        });
      }
    } catch (error) {
      console.error("Notification permission error:", error);
    }
  }

  // -----------------------------
  // CHECK NOTIFICATION PERMISSION
  // -----------------------------
  useEffect(() => {
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // -----------------------------
  // SAVE USERNAME
  // -----------------------------
  async function saveUsername(e) {
    e.preventDefault();

    const name = nameInput.trim();

    if (!name) {
      alert("Please enter your name");
      return;
    }

    if (name.length > 30) {
      alert("Name must be 30 characters or less");
      return;
    }

    const { error } = await s
      .from("profiles")
      .upsert({
        id: user.id,
        username: name,
      });

    if (error) {
      alert("Name save error: " + error.message);
      console.error(error);
      return;
    }

    setUsername(name);
    alert("Name saved successfully!");
  }

  // -----------------------------
  // LOAD GROUPS
  // -----------------------------
  async function loadGroups() {
    const { data, error } = await s
      .from("group_members")
      .select("group_id,groups(id,name,invite_code)")
      .eq("user_id", user.id);

    if (error) {
      console.error("Groups error:", error);
      return;
    }

    setGroups(
      (data || [])
        .map((x) => x.groups)
        .filter(Boolean)
    );
  }

  // -----------------------------
  // LOAD MESSAGES + NAMES
  // -----------------------------
  async function loadMessages(id) {
    const { data, error } = await s
      .from("messages")
      .select("id,user_id,content,created_at")
      .eq("group_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Messages error:", error);
      return;
    }

    const messageList = data || [];
    setMessages(messageList);

    const userIds = [
      ...new Set(messageList.map((m) => m.user_id)),
    ];

    if (userIds.length === 0) {
      setProfiles({});
      return;
    }

    const { data: profileData, error: profileError } = await s
      .from("profiles")
      .select("id,username")
      .in("id", userIds);

    if (profileError) {
      console.error("Profile names error:", profileError);
      return;
    }

    const profileMap = {};

    (profileData || []).forEach((p) => {
      profileMap[p.id] = p.username;
    });

    setProfiles(profileMap);
  }

  // -----------------------------
  // INITIAL LOAD
  // -----------------------------
  useEffect(() => {
    loadUsername();
    loadGroups();
  }, []);

  // -----------------------------
  // REALTIME MESSAGES
  // -----------------------------
  useEffect(() => {
    if (!active) return;

    loadMessages(active.id);

    const channel = s
      .channel("messages-" + active.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "group_id=eq." + active.id,
        },
        async (payload) => {
          await loadMessages(active.id);

          // Apne message ki notification nahi
          if (payload.new.user_id === user.id) {
            return;
          }

          // Notification sirf tab jab page background me ho
          if (
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted" &&
            document.visibilityState !== "visible"
          ) {
            let senderName = "New message";

            const { data: senderProfile } = await s
              .from("profiles")
              .select("username")
              .eq("id", payload.new.user_id)
              .maybeSingle();

            if (senderProfile?.username) {
              senderName = senderProfile.username;
            }

            const notification = new Notification(senderName, {
              body: payload.new.content || "New message",
              tag: "friendchat-" + active.id,
            });

            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          }
        }
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });

    return () => {
      s.removeChannel(channel);
    };
  }, [active, user.id]);

  // -----------------------------
  // SEND MESSAGE
  // -----------------------------
  async function send(e) {
    e.preventDefault();

    if (!text.trim() || !active) return;

    const messageText = text.trim();

    const { error } = await s
      .from("messages")
      .insert({
        group_id: active.id,
        user_id: user.id,
        content: messageText,
      });

    if (error) {
      alert("Message error: " + error.message);
      console.error(error);
      return;
    }

    setText("");
    await loadMessages(active.id);
  }

  // -----------------------------
  // CREATE GROUP
  // -----------------------------
  async function create(e) {
    e.preventDefault();

    if (!newGroup.trim()) return;

    const { error } = await s.rpc(
      "create_chat_group",
      {
        group_name: newGroup.trim(),
      }
    );

    if (error) {
      alert("Create group error: " + error.message);
      console.error(error);
      return;
    }

    setNewGroup("");
    await loadGroups();
  }

  // -----------------------------
  // JOIN GROUP
  // -----------------------------
  async function joinGroup(e) {
    e.preventDefault();

    if (!inviteCode.trim()) return;

    const { error } = await s.rpc(
      "join_chat_group",
      {
        group_invite_code: inviteCode.trim(),
      }
    );

    if (error) {
      alert("Join group error: " + error.message);
      console.error(error);
      return;
    }

    setInviteCode("");
    await loadGroups();

    alert("Group joined successfully!");
  }

  // -----------------------------
  // LOGOUT
  // -----------------------------
  async function logout() {
    await s.auth.signOut();
    location.reload();
  }

  return (
    <main className="container">

      {/* TOP BAR */}
      <div className="topbar">
        <div>
          <h1>💬 FriendChat</h1>
          <span className="small">
            {user.email}
          </span>
        </div>

        <button onClick={logout}>
          Logout
        </button>
      </div>

      <div className="chat-layout">

        {/* SIDEBAR */}
        <aside className="card sidebar">

          {/* USERNAME */}
          <h3>Your Name</h3>

          <form onSubmit={saveUsername}>
            <input
              placeholder="Enter your name"
              value={nameInput}
              onChange={(e) =>
                setNameInput(e.target.value)
              }
              maxLength={30}
            />

            <button type="submit">
              Save Name
            </button>
          </form>

          {username && (
            <p className="small">
              Chat name: <b>{username}</b>
            </p>
          )}

          {/* NOTIFICATIONS */}
          <h3>🔔 Notifications</h3>

          {notificationPermission === "granted" ? (
            <p className="small">
              ✅ Notifications enabled
            </p>
          ) : notificationPermission === "denied" ? (
            <p className="small">
              ❌ Notifications blocked.
              <br />
              Browser settings se notifications allow karein.
            </p>
          ) : (
            <button
              type="button"
              onClick={enableNotifications}
            >
              🔔 Enable Notifications
            </button>
          )}

          {/* CREATE GROUP */}
          <h3>Create Group</h3>

          <form onSubmit={create}>
            <input
              placeholder="New group name"
              value={newGroup}
              onChange={(e) =>
                setNewGroup(e.target.value)
              }
            />

            <button type="submit">
              Create Group
            </button>
          </form>

          {/* JOIN GROUP */}
          <h3>Join Group</h3>

          <form onSubmit={joinGroup}>
            <input
              placeholder="Enter invite code"
              value={inviteCode}
              onChange={(e) =>
                setInviteCode(e.target.value)
              }
            />

            <button type="submit">
              Join Group
            </button>
          </form>

          {/* GROUP LIST */}
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
                  (active?.id === g.id
                    ? "active"
                    : "")
                }
                key={g.id}
                onClick={() => setActive(g)}
              >
                {g.name}
              </div>
            ))
          )}

        </aside>

        {/* CHAT */}
        <section className="card">

          {!active ? (
            <>
              <h2>Welcome 👋</h2>

              <p>
                Create a group or join one
                using an invite code.
              </p>
            </>
          ) : (
            <>

              {/* GROUP HEADER */}
              <div className="topbar">
                <div>
                  <h2>{active.name}</h2>

                  <span className="small">
                    Invite Code:{" "}
                    <b>{active.invite_code}</b>
                  </span>
                </div>
              </div>

              {/* MESSAGES */}
              <div className="messages">

                {messages.length === 0 ? (
                  <p className="small">
                    No messages yet.
                    Start the conversation!
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      className="message"
                      key={m.id}
                    >

                      <b>
                        {profiles[m.user_id] ||
                          "User"}
                      </b>

                      <div>
                        {m.content}
                      </div>

                      <span className="small">
                        {new Date(
                          m.created_at
                        ).toLocaleString()}
                      </span>

                    </div>
                  ))
                )}

              </div>

              {/* MESSAGE BOX */}
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