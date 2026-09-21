import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Check,
  CheckCheck,
  Clock,
  ShieldCheck,
  Phone,
  HeartPulse,
  Droplet,
  Hospital,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import { api, socket } from '../services/api';

/**
 * Format timestamp into readable time (e.g., 12:45 PM)
 */
const formatTime = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * ChatModal Component
 * Provides private real-time messaging between an Accepted Donor and an Emergency Requester.
 * Strictly allowed only after the donor has accepted the emergency request.
 */
export default function ChatModal({
  isOpen,
  onClose,
  emergencyId,
  donorId,
  currentUserRole = 'donor', // 'donor' | 'requester'
  currentUserId,
  trackingToken = null,
  emergencySummary = null,
  partnerInfo = null,
}) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorNotice, setErrorNotice] = useState(null);
  const [emergencyDetails, setEmergencyDetails] = useState(emergencySummary);
  const [partnerDetails, setPartnerDetails] = useState(partnerInfo);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Load conversation and subscribe to real-time events
  useEffect(() => {
    if (!isOpen || !emergencyId || !donorId) return;

    let isMounted = true;
    setLoading(true);
    setErrorNotice(null);

    const loadData = async () => {
      try {
        const res = await api.getConversation(emergencyId, donorId, trackingToken);
        if (!isMounted) return;

        if (res.success) {
          setMessages(res.conversation?.messages || []);
          if (res.emergencyDetails) setEmergencyDetails(res.emergencyDetails);
          if (res.partnerDetails) setPartnerDetails(res.partnerDetails);

          // Mark unread messages as read
          await api.markMessagesRead(emergencyId, donorId, trackingToken);
        } else {
          setErrorNotice(
            res.message ||
              'Unable to load conversation. Private chat is only permitted after a donor has accepted the emergency request.'
          );
        }
      } catch (err) {
        if (!isMounted) return;
        setErrorNotice(
          'Failed to load conversation. Please ensure you are connected to the network.'
        );
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    // Socket.io Real-time setup
    const roomPayload = { emergencyId, donorId };
    socket.emit('join_conversation', roomPayload);

    const handleNewMessage = (payload) => {
      if (
        payload.emergencyId?.toString() === emergencyId?.toString() &&
        payload.donorId?.toString() === donorId?.toString()
      ) {
        setMessages((prev) => {
          // Avoid duplicates
          const exists = prev.some(
            (m) =>
              (m._id && m._id === payload.message._id) ||
              (m.createdAt === payload.message.createdAt && m.text === payload.message.text)
          );
          if (exists) return prev;
          return [...prev, payload.message];
        });

        // Mark incoming message as read
        api.markMessagesRead(emergencyId, donorId, trackingToken).catch(() => {});
      }
    };

    const handleMessagesRead = (payload) => {
      if (
        payload.emergencyId?.toString() === emergencyId?.toString() &&
        payload.donorId?.toString() === donorId?.toString()
      ) {
        setMessages((prev) =>
          prev.map((msg) => ({
            ...msg,
            status: 'read',
          }))
        );
      }
    };

    socket.on('new_message', handleNewMessage);
    socket.on('messages_read', handleMessagesRead);

    // Focus input on open
    setTimeout(() => {
      inputRef.current?.focus();
      scrollToBottom('auto');
    }, 200);

    return () => {
      isMounted = false;
      socket.emit('leave_conversation', roomPayload);
      socket.off('new_message', handleNewMessage);
      socket.off('messages_read', handleMessagesRead);
    };
  }, [isOpen, emergencyId, donorId, trackingToken]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Send message
  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const textToSend = inputText.trim();
    if (!textToSend || sending) return;

    setSending(true);
    setInputText('');

    // Optimistic message rendering
    const tempId = 'temp_' + Date.now();
    const optimisticMsg = {
      _id: tempId,
      senderId: currentUserId || 'current',
      text: textToSend,
      status: 'sent',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await api.sendMessage(emergencyId, donorId, textToSend, trackingToken);
      if (res.success && res.message) {
        setMessages((prev) =>
          prev.map((m) => (m._id === tempId ? res.message : m))
        );
      } else {
        setErrorNotice(res.message || 'Failed to send message.');
        setMessages((prev) => prev.filter((m) => m._id !== tempId));
      }
    } catch (err) {
      setErrorNotice('Network error sending message.');
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  // Helper to determine if a message was sent by the current active viewer
  const isMessageSentByMe = (msg) => {
    if (currentUserRole === 'donor') {
      return (
        msg.senderId?.toString() === donorId?.toString() ||
        msg.senderId?.toString() === currentUserId?.toString()
      );
    } else {
      // Viewer is Requester
      return (
        msg.senderId?.toString() !== donorId?.toString() ||
        msg.senderId?.toString() === currentUserId?.toString()
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 flex flex-col h-[650px] max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-vital-700 via-vital-600 to-rose-600 text-white px-5 py-4 flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-md shadow-inner text-white font-black text-base shrink-0">
              {currentUserRole === 'donor' ? (
                <HeartPulse className="w-6 h-6 text-white" />
              ) : (
                <Droplet className="w-6 h-6 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="font-extrabold text-base truncate">
                  {currentUserRole === 'donor'
                    ? `Emergency Requester: ${emergencyDetails?.patientName || 'Patient'}`
                    : `Accepted Volunteer Donor: ${partnerDetails?.fullName || 'Donor'}`}
                </h2>
                <span className="flex h-2 w-2 relative shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                </span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-white/85 truncate mt-0.5">
                <span className="font-bold px-1.5 py-0.2 rounded bg-white/20">
                  {emergencyDetails?.bloodGroup || 'Blood Need'}
                </span>
                <span>•</span>
                <span className="truncate">
                  {emergencyDetails?.hospitalName || 'Hospital Network'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {partnerDetails?.mobileNumber && (
              <a
                href={`tel:${partnerDetails.mobileNumber}`}
                className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors"
                title={`Call ${partnerDetails.mobileNumber}`}
              >
                <Phone className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors"
              title="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Security & Acceptance Privacy Shield Banner */}
        <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 text-[11px] text-emerald-900 flex items-center space-x-2 shrink-0">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="truncate">
            <strong>Verified Direct Chat:</strong> Unlocked because the donor has accepted this urgent blood request.
          </span>
        </div>

        {/* Error Alert if blocked */}
        {errorNotice && (
          <div className="bg-rose-50 border-b border-rose-200 p-3 text-xs text-rose-800 flex items-start space-x-2 shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Access Restricted</p>
              <p>{errorNotice}</p>
            </div>
            <button
              onClick={() => setErrorNotice(null)}
              className="text-rose-500 hover:text-rose-800 text-xs font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Messages Body */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/70">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-2 text-slate-400">
              <div className="w-8 h-8 border-3 border-vital-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-semibold">Connecting private channel...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-vital-50 text-vital-600 flex items-center justify-center shadow-inner">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div className="max-w-xs space-y-1">
                <h4 className="text-sm font-bold text-slate-800">
                  Donor Connection Active
                </h4>
                <p className="text-xs text-slate-500">
                  You can now coordinate arrival times, hospital departments, or any urgent details in real time.
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isMe = isMessageSentByMe(msg);
              const formattedTime = formatTime(msg.createdAt);

              return (
                <div
                  key={msg._id || index}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[80%] sm:max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm break-words ${
                      isMe
                        ? 'bg-gradient-to-r from-vital-600 to-rose-600 text-white rounded-br-xs'
                        : 'bg-white border border-slate-200/90 text-slate-800 rounded-bl-xs'
                    }`}
                  >
                    {msg.text}
                  </div>

                  {/* Message Metadata: Timestamp and Status */}
                  <div
                    className={`flex items-center space-x-1 text-[10px] text-slate-400 mt-1 px-1 ${
                      isMe ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span>{formattedTime}</span>

                    {/* Status badges for sent messages */}
                    {isMe && (
                      <span className="inline-flex items-center space-x-0.5 ml-1">
                        {msg.status === 'read' ? (
                          <span
                            className="inline-flex items-center text-emerald-600 font-bold"
                            title="Status: Read"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span className="text-[9px] uppercase tracking-wider ml-0.5">Read</span>
                          </span>
                        ) : msg.status === 'delivered' ? (
                          <span
                            className="inline-flex items-center text-slate-500 font-medium"
                            title="Status: Delivered"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span className="text-[9px] uppercase tracking-wider ml-0.5">Delivered</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center text-slate-400 font-medium"
                            title="Status: Sent"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span className="text-[9px] uppercase tracking-wider ml-0.5">Sent</span>
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Box & Send Button */}
        <form
          onSubmit={handleSend}
          className="p-3 bg-white border-t border-slate-200 flex items-center space-x-2 shrink-0"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your message..."
            maxLength={2000}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-vital-500 focus:ring-2 focus:ring-vital-500/20 transition-all"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || sending || loading}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-vital-600 to-rose-600 hover:from-vital-700 hover:to-rose-700 disabled:opacity-50 text-white font-bold text-sm shadow-md shadow-vital-600/20 transition-all flex items-center justify-center space-x-1.5 active:scale-95 shrink-0"
            title="Send message"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
