import { wire } from "lwc";
import { NavigationMixin, CurrentPageReference } from "lightning/navigation";
import { MessageContext, subscribe, unsubscribe, publish, APPLICATION_SCOPE } from "lightning/messageService";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import * as BwcUtils from "c/bwcUtils";
import * as BwcPageHelpers from "c/bwcPageHelpers";
import * as BWCLogger from "c/bwcLogger";
import * as BwcAnalyticsEventServices from 'c/bwcAnalyticsEventServices';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import quantumJs from '@salesforce/resourceUrl/QuantumScript';
import getQMFlagStatus from '@salesforce/apex/QMCustomSettinghandler.getQMFlagStatus'; 



// QM User Fields
import Id from '@salesforce/user/Id';
import { getRecord } from 'lightning/uiRecordApi';
import userUserNameFIELD from '@salesforce/schema/User.Username';
import userNameFIELD from '@salesforce/schema/User.Name';
import userEmailFIELD from '@salesforce/schema/User.Email';
import userIsActiveFIELD from '@salesforce/schema/User.IsActive';
import userPhoneFIELD from '@salesforce/schema/User.Phone';
import userATTIDFIELD from '@salesforce/schema/User.ATTUID__c';
import userProfileFIELD from '@salesforce/schema/User.ProfileId';
import userLastLoginFIELD from '@salesforce/schema/User.LastLoginDate';
import userStoreFIELD from '@salesforce/schema/User.StoreLocationId__c';

// Message channels
import REFRESHMC from "@salesforce/messageChannel/BWC_Refresh__c";

export const BwcPageElementMixin  = Base  => {

    return class extends NavigationMixin (Base)  {

        @wire(CurrentPageReference)
        currentPageReference; 
    
        @wire(MessageContext)
        messageContext;
        
        currentUserData;
        @wire(getRecord, { recordId: Id, fields: [userUserNameFIELD, userNameFIELD, userEmailFIELD, userIsActiveFIELD, userPhoneFIELD, userATTIDFIELD, userProfileFIELD, userLastLoginFIELD, userStoreFIELD]}) 
        currentUserInfo({error, data}) {
            if (data) {
                this.currentUserData = data;
                this.logQMUserData();
            } else if(error) {
            }
        }
   
        subscriptions = []; // Manage subscriptions to auto-release on disconnect
        qmReplayLink;

        /*
            Derived class should call super.connectedCallback if it overrides this.
        */
        connectedCallback() {
                
            // Call bwcComponentBase version
            super.connectedCallback();
    
            // By default, subscribe to refresh since most components should act on a refresh.
            // Derived class can just override handleLmsRefresh.
            this.subscribeToMessage(
                REFRESHMC,
                (message) => {
                    this.handleLmsRefresh(message.scope, message.recordId);
                },
                true
            ); 
            
            getQMFlagStatus()
                .then(result => {
                    if(result === true){
                        debugger;
                        Promise.all([
                            loadScript(this, quantumJs, {trustedMode: true, trustedGlobals: ['QuantumMetricUser'] }),
                        ]).then(() => {
                            debugger;
                            this.logQMUserData();
                            console.log('Quantum js Loaded');
                            if(!this.qmReplayLink) {
                                this.qmReplayLink = QuantumMetricAPI.getReplay();
                            }
                        
                        }).catch(error => {
                        console.log('ERROR loading Quantum js', error);
                
                        });                  
                    }

                }).catch(error =>{
                    console.log("error==",error);
                })
                
        }          

        logQMUserData() {
            if(this.currentUserData && this.currentUserData.fields) {
                if(!window.QuantumMetricUser) window.QuantumMetricUser = {};
                let cudFields = this.currentUserData.fields;
                if(cudFields.Username && cudFields.Username.value) {
                    window.QuantumMetricUser.currentUserName = cudFields.Username.value;
                }
                if(cudFields.Name && cudFields.Name.value) {
                    window.QuantumMetricUser.name = cudFields.Name.value;
                }
                if(cudFields.Email && cudFields.Email.value) {
                    window.QuantumMetricUser.email = cudFields.Email.value;
                }
                if(cudFields.IsActive && cudFields.IsActive.value) {
                    window.QuantumMetricUser.isActive = cudFields.IsActive.value;
                }
                if(cudFields.Phone && cudFields.Phone.value) {
                    window.QuantumMetricUser.phoneNumber = cudFields.Phone.value;
                }
                if(cudFields.ATTUID__c && cudFields.ATTUID__c.value) {
                    window.QuantumMetricUser.attuid = cudFields.ATTUID__c.value;
                }
                if(cudFields.CreatedDate && cudFields.CreatedDate.value) {
                    window.QuantumMetricUser.profile = cudFields.Profile.value.fields.Name.value;
                }
                if(cudFields.LastLoginDate && cudFields.LastLoginDate.value) {
                    window.QuantumMetricUser.lastLogin = cudFields.LastLoginDate.value;
                }
                if(cudFields.StoreLocationId__c && cudFields.StoreLocationId__c.value) {
                    window.QuantumMetricUser.store = cudFields.StoreLocationId__c.value;
                }
            }
        }
    
        /*
            Derived class should call super.disconnectedCallback if it overrides this.
        */
        disconnectedCallback() {
            // Unsubscribe from any LMS subscriptions.
            this.subscriptions.forEach((subscription) => {
                unsubscribe(subscription);
            });
        }
    
        /*
            Subscribe to an LMS message channel.
        */
        subscribeToMessage(messageChannel, callback, isApplicationScope) {
            const subscription = subscribe(
                this.messageContext,
                messageChannel,
                callback,
                isApplicationScope ? { scope: APPLICATION_SCOPE } : undefined
            );
            this.subscriptions.push(subscription);
        }
    
        /*
            Unsubscribe from an LMS message channel subscription.
        */
        unsubscribeFromMessage(subscription) {
            unsubscribe(subscription);
            const index = this.subscriptions.findIndex((sub) => sub === subscription);
            if (index !== -1) {
                this.subscriptions.splice(index, 1);
            }
        }
    
        /*
            Publish a message to an LMS message channel.
        */
        publishMessage(messageChannel, message) {
            publish(this.messageContext, messageChannel, message);
        }
    
        /*
            Easily send a refresh message for other components to handle.
        */
        sendLmsRefresh(recordId, scope) {
            this.publishMessage(REFRESHMC, { scope, recordId });
        }
    
        /*
            Derived class overrides this to handle refresh message.
        */
        // eslint-disable-next-line no-unused-vars
        handleLmsRefresh(scope, recordId) {}
    
        /*
            Use navigate service to navigate to specified page reference.
        */
        navigate(pageReference, replace) {
            this[NavigationMixin.Navigate](pageReference, replace);
        }
    
        /*
            Use navigate service to generate the target URL for a specified page reference.
        */
        generateUrl(pageReference) {
            return this[NavigationMixin.GenerateUrl](pageReference);
        }
    
        /*
            Open the specified page reference in a subtab, if on desktop. Otherwise navigate to the page.
        */
        openSubtab(pageReference, label, icon, replace) {
            if (!this.isMobile) {
                BwcPageHelpers.openSubtab(pageReference, label, icon);
            } else {
                // We are not on desktop, so no sub-tab, just navigate to page reference
                this.navigate(pageReference, replace);
            }
        }
    
        /*
            Open the specified page reference in a console tab.
        */
        openTab(pageReference, label, icon, replace) {
            if (!this.isMobile) {
                BwcPageHelpers.openTab(pageReference, label, icon);
            } else {
                // We are not on desktop, so no sub-tab, just navigate to page reference
                this.navigate(pageReference, replace);
            }
        }
    
        /*
            Open specified page in a new browser tab.
        */
        async openNewTab(pageReference) {
    
            let targetUrl;
            if (typeof pageReference === 'string') {
                targetUrl = pageReference;
            }
            else {
                targetUrl = await this.generateUrl(pageReference);
            }
    
            if (targetUrl === '') {
                targetUrl = pageReference.attributes?.url;
            }
    
            // Just open new tab
            window.open(targetUrl, "_blank");
        }
    
        /*
            Close the focused console tab. If one mobile, navigate to homepage instead.
        */
        closeFocusedTab() {
            if (!this.isMobile) {
                BwcPageHelpers.closeFocusedTab();
            } else {
                // Not in console, just navigate to home.
                this.navigate({
                    type: "standard__namedPage",
                    attributes: {
                        pageName: "home"
                    }
                });
            }
        }
    
        /*
            Fire event to show toast.
        */
        showToast(title, message, variant, mode) {
            this.dispatchEvent(new ShowToastEvent({ title, message, variant, mode }));
        }
    
        /*
            Add any notification, page template must include c-bwc-notifications component.
        */
        addNotification(type, message, variant, action, texture, theme) {
            const notificationsComponent = this.template.querySelector("c-bwc-notifications");
            if (notificationsComponent) {
                notificationsComponent.addNotification(type, message, variant, null, action, texture, theme);
            } else {
                BwcUtils.warn("No bwc-notifications component found, notification could not be displayed.");
            }
        }
    
        /*
            Add a scoped notification, page template must include c-bwc-notifications component.
        */
        addScopedNotification(message, variant, texture, theme ) {
            this.addNotification("scoped", message, variant, undefined, texture, theme);
        }
    
        /*
            Add an inline notification, page template must include c-bwc-notifications component.
        */
        addInlineNotification(message, variant) {
            this.addNotification("inline", message, variant);
        }
    
        /*
            Remove all notifications from c-bwc-notifications component.
        */
        clearNotifications() {
            const notificationsComponent = this.template.querySelector("c-bwc-notifications");
            if (notificationsComponent) {
                notificationsComponent.clearNotifications();
            }
        }
    
        /*
            Returns true if there is at least one notification.
        */
        get hasNotifications() {
            const notificationsComponent = this.template.querySelector("c-bwc-notifications");
            if (notificationsComponent) {
                return notificationsComponent.hasNotifications;
            }
            return false;
        }
    
        /*
            Returns true if there is at least one notification with variant == error.
        */
        get hasErrorNotifications() {
            const notificationsComponent = this.template.querySelector("c-bwc-notifications");
            if (notificationsComponent) {
                return notificationsComponent.hasErrorNotifications;
            }
            return false;
        }
    
        /*
            Use notifications component on component to display error to user.
        */
        handleError(error, message, context, notificationType, action, variant) {
    
            let errorToLog;
            if (error?.body?.message && error.body.message.startsWith('{')) {
                try {
                    errorToLog = JSON.parse(error.body.message);
                }
                catch(e) {                
                    errorToLog = error;
                }
            }
            else {
                errorToLog = error;
            }
    
            // Always show in console.
            if (context) {
                BwcUtils.error('Error in ' + context, errorToLog);
            }
            else {
                BwcUtils.error(errorToLog);
            }
    
            // For mobile, write to nebula
            if (this.isMobile) {
                if (error instanceof Error) {
                    BWCLogger.logError(error);
                }
                else {
                    BWCLogger.logError(new Error(error));
                }
            }
    
            let finalMessage;
            if (message) {
                finalMessage = message;
            }
            else if (error.message) {
                finalMessage = error.message;
            }
            else if (error.body) {
                finalMessage = error.body.message;
                // Check for JSON content inside body message
                if (finalMessage?.startsWith('{')) {
                    try {
                        const innerMessage = JSON.parse(finalMessage);
                        if (innerMessage.message) {
                            finalMessage = innerMessage.message;
                        }
                    }
                    catch(e) {                
                        // Leave as-is
                    }
                }
            }
            else {
                finalMessage = error;
            }
    
            this.addNotification(notificationType ? notificationType : "scoped", finalMessage,variant ? variant : "error", action);
        }
    
        /*
            Open a modal and return a promise which is resolved when the modal closes.
        */
        // eslint-disable-next-line no-unused-vars
        async showModal(bodyComponentName, bodyComponentArguments, cssClass, showCloseButton) {
            BwcPageHelpers.showModal(...arguments);
        }
    
        /*
            Open a modal or subtab with the same content.
        */
        async showModalEx(args) {
            BwcPageHelpers.showModalEx(args);
        }
    
        /*
            Show a simple confirmation modal with specific title, message, and button labels.
        */
        // eslint-disable-next-line no-unused-vars
        async confirm(title, message, okButtonLabel, cancelButtonLabel, okCallback, cancelCallback) {
            return BwcPageHelpers.confirm(...arguments);
        }
    
        /*
            Log a watermark event.
        */
        async logAnalyticsEvent(eventName, interactionId, billingAccountId, caseId, detailValues) {
            const currentPageUrl = await this.generateUrl(this.currentPageReference);        
            BwcAnalyticsEventServices.logAnalyticsEvent(eventName, interactionId, billingAccountId, caseId, detailValues, currentPageUrl);
        }
    
        /**
         * @param  {String} message. 
         */
        async log(message) {
    
            message = typeof message != 'string' ? JSON.serialize(message) : message;
    
            await BWCLogger.log(message);
    
        }
    
        /**
         * @param  {Error} error
         */
         async logError(error) {
    
            error = error instanceof Error ? error : new Error(error);
    
            await BWCLogger.logError(error);
    
        }
    


    };

}