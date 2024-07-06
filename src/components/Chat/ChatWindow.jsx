import React, { useEffect, useState } from 'react';
import './ChatWindow.css';
import {
  fetchChatHistory,
  sendMessage as apiSendMessage,
  deleteMessage as apiDeleteMessage,
  updateMessage as apiUpdateMessage,
} from '../../api/api';
import { Centrifuge } from 'centrifuge';
import ChatInfoModal from './ChatInfoModal';
import sendIcon from '../../assets/send.svg';
import deleteIcon from '../../assets/delete.svg';
import editIcon from '../../assets/edit.svg';

const CHAT_API_URL = 'http://localhost:8000/chats/';

const ChatWindow = ({ chatId }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [editMessageId, setEditMessageId] = useState(null);
  const [editMessageText, setEditMessageText] = useState('');
  const [centrifuge, setCentrifuge] = useState(null);
  const [chatInfo, setChatInfo] = useState(null); // состояние для хранения информации о чате
  const [showModal, setShowModal] = useState(false); // состояние для отображения модального окна

  const fetchData = async () => {
    try {
      const response = await fetchChatHistory(chatId);
      if (response.data && response.data.chats) {
        setMessages(response.data.chats);
        setChatInfo(response.data); // сохраняем информацию о чате
      } else {
        setMessages([]);
        setChatInfo(null);
      }
    } catch (error) {
      console.error('Failed to fetch chat history', error);
      setMessages([]);
      setChatInfo(null);
    }
  };

  useEffect(() => {
    if (chatId) {
      fetchData();
    }
  }, [chatId]);

  useEffect(() => {
    const initCentrifuge = async () => {
      try {
        const response = await fetch(CHAT_API_URL + 'get-cent-token', {
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error(response.statusText);
        }

        const centrifugoData = await response.json();

        const centrifugeInstance = new Centrifuge(centrifugoData.url, {
          token: centrifugoData.token
        });

        centrifugeInstance.on('connecting', function (ctx) {
          console.log(`connecting: ${ctx.code}, ${ctx.reason}`);
        }).on('connected', function (ctx) {
          console.log(`connected over ${ctx.transport}`);
        }).on('disconnected', function (ctx) {
          console.log(`disconnected: ${ctx.code}, ${ctx.reason}`);
        });

        centrifugeInstance.connect();

        const sub = centrifugeInstance.newSubscription(`${chatId}`);

        sub.on('publication', function (ctx) {
          if (ctx.data && ctx.data.type) {
            const { type, data } = ctx.data;
            if (type === 'send_message') {
              fetchData();  // обновляем историю сообщений после получения нового сообщения
            } else if (type === 'edit_message') {
              setMessages(prevMessages => prevMessages.map(msg => msg.id === data.messageId ? { ...msg, text: data.text } : msg));
              updateChatInfo();
            } else if (type === 'delete_message') {
              setMessages(prevMessages => prevMessages.filter(msg => msg.id !== data.messageId));
              updateChatInfo();
            }
          }
        });

        sub.subscribe();

        setCentrifuge(centrifugeInstance);
      } catch (error) {
        console.error('Failed to initialize Centrifugo', error);
      }
    };

    if (chatId) {
      initCentrifuge();
    }

    return () => {
      if (centrifuge) {
        centrifuge.disconnect();
      }
    };
  }, [chatId]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    try {
      if (!newMessage.trim()) {
        return;
      }
      await apiSendMessage(chatId, newMessage);
      setNewMessage('');
      fetchData();  // обновление списка сообщений после отправки нового
    } catch (error) {
      console.error('Failed to send message', error);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      await apiDeleteMessage(chatId, messageId);
      setMessages(prevMessages => prevMessages.filter(message => message.id !== messageId));
    } catch (error) {
      console.error('Failed to delete message', error);
    }
  };

  const handleEditMessage = async (e) => {
    e.preventDefault();
    try {
      if (!editMessageText.trim()) {
        return;
      }
      await apiUpdateMessage(chatId, editMessageId, { text: editMessageText });
      setMessages(prevMessages => prevMessages.map(message =>
        message.id === editMessageId ? { ...message, text: editMessageText } : message
      ));
      setEditMessageId(null);
      setEditMessageText('');
    } catch (error) {
      console.error('Failed to update message', error);
    }
  };

  const startEditingMessage = (message) => {
    setEditMessageId(message.id);
    setEditMessageText(message.text);
  };

  const openModal = () => {
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const updateChatInfo = async () => {
    try {
      const response = await fetchChatHistory(chatId);
      if (response.data) {
        setChatInfo(response.data);
      }
    } catch (error) {
      console.error('Failed to update chat info', error);
    }
  };

  return (
    <div className="chat-window">
      {/* Название группы и кнопка для отображения модального окна */}
      {chatInfo && (
        <div className="chat-info">
          <h3>{chatInfo.chat_name}</h3>
          <button onClick={openModal}>
            Chat Info
          </button>
        </div>
      )}

      <div className="message-list">
        {messages && [...messages].reverse().map(message => (
          <div className="message-item" key={message.id}>
            <strong>{message.senderName}</strong>: {message.text}
            <div className="message-item-icons">
              {/* Иконка для удаления */}
              <img
                src={deleteIcon}
                alt="Delete"
                className="message-item-icon delete-icon"
                onClick={() => handleDeleteMessage(message.id)}
              />
              {/* Иконка для редактирования */}
              <img
                src={editIcon}
                alt="Edit"
                className="message-item-icon edit-icon"
                onClick={() => startEditingMessage(message)}
              />
            </div>
          </div>
        ))}
      </div>

      {editMessageId !== null && (
        <form className="message-item" onSubmit={handleEditMessage}>
          <input
            type="text"
            value={editMessageText}
            onChange={(e) => setEditMessageText(e.target.value)}
          />
          <button type="submit">
            <img src={sendIcon} alt="Send" className="send-icon" />
          </button>
          <button type="button" onClick={() => { setEditMessageId(null); setEditMessageText(''); }}>
            Отменить
          </button>
        </form>
      )}

      {editMessageId === null && (
        <form className="message-item" onSubmit={handleSendMessage}>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
          />
          <button type="submit">
            <img src={sendIcon} alt="Send" className="send-icon" />
          </button>
        </form>
      )}

      {/* Модальное окно для отображения информации о чате */}
      {showModal && (
        <ChatInfoModal
          chatId={chatId}
          chatInfo={chatInfo}
          onDeleteMember={(username) => {
            updateChatInfo();
          }}
          onClose={closeModal}
        />
      )}
    </div>
  );
};

export default ChatWindow;
