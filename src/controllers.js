import noop from 'lodash/noop';
import { loadFeedContents } from './http';
import {
  parseXmlString,
  getFeedDetails,
  markPostAsRead,
  getTranslationKeyFromError,
} from './utils';
import { FormStatuses } from './constants';

const onSubscriptionFormSubmit = (state, urlSchema) => (e) => {
  const formData = new FormData(e.target);
  const rssUrl = formData.get('rss-url');
  urlSchema.validate(rssUrl)
    .then((url) => {
      state.subscriptionForm = {
        status: FormStatuses.LOADING,
        message: '',
      };
      return loadFeedContents(url);
    })
    .then(({ data }) => {
      const xmlDoc = parseXmlString(data.contents);
      const error = xmlDoc.querySelector('parsererror');

      if (error) {
        throw new Error('invalidRss');
      }

      const { items, ...newFeed } = getFeedDetails(xmlDoc);

      state.feeds = [newFeed, ...state.feeds];
      state.posts = [...items, ...state.posts];

      return rssUrl;
    })
    .then((feedUrl) => {
      state.feedUrls.push(feedUrl);
      state.subscriptionForm = {
        status: FormStatuses.SUBMITTED,
        message: 'subscriptionForm.feedback.rssLoaded',
      };
      e.target.reset();
    })
    .catch((err) => {
      state.subscriptionForm = {
        status: FormStatuses.FAILED,
        message: getTranslationKeyFromError(err),
      };
    });
  e.preventDefault();
};

const subscribeToFeedUpdates = (state, interval = 5000) => {
  const timestamp = Date.now();

  setTimeout(
    () => Promise.allSettled(state.feedUrls.map(loadFeedContents))
      .then((results) => results
        .filter(({ status }) => status === 'fulfilled')
        .map(({ value }) => {
          const xmlDoc = parseXmlString(value.data.contents);
          const error = xmlDoc.querySelector('parsererror');
          return error ? null : getFeedDetails(xmlDoc);
        })
        .filter(Boolean)
        .flatMap(({ items }) => items)
        .filter((post) => Date.parse(post.publishedAt) >= timestamp))
      .then((newPosts) => {
        if (newPosts.length) {
          state.posts = [...newPosts, ...state.posts];
        }
      })
      .catch(noop)
      .finally(() => subscribeToFeedUpdates(state, interval)),
    interval,
  );
};

const onPostModalOpen = (state) => (e) => {
  const triggerButton = e.relatedTarget;
  const { postId } = triggerButton.dataset;
  const updatedPosts = markPostAsRead(state.posts, postId);
  state.ui.postModal = { postId };
  state.posts = updatedPosts;
};

const onPostModalClose = (state) => () => {
  const postId = '';
  state.ui.postModal = { postId };
};

const onPostLinkClick = (state) => (e) => {
  const { postId } = e.target.dataset;
  const updatedPosts = markPostAsRead(state.posts, postId);
  state.posts = updatedPosts;
};

export {
  onSubscriptionFormSubmit,
  subscribeToFeedUpdates,
  onPostModalOpen,
  onPostModalClose,
  onPostLinkClick,
};
