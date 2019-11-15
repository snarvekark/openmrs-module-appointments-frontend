import PropTypes from "prop-types";
import React, {Fragment, useEffect, useState} from "react";
import {injectIntl} from "react-intl";
import classNames from "classnames";
import {
    appointmentEditor,
    recurringContainer,
    recurringContainerLeft,
    recurringContainerRight,
    searchFieldsContainer,
    searchFieldsContainerLeft,
    dateHeading,
    appointmentPlanContainer
} from "../AddAppointment/AddAppointment.module.scss";
import {conflictsPopup, customPopup} from "../CustomPopup/CustomPopup.module.scss";
import SearchFieldsContainer from "../AppointmentEditorCommonFieldsWrapper/AppointmentEditorCommonFieldsWrapper.jsx";
import {getRecurringAppointment} from "../../api/recurringAppointmentsApi";
import {getAppointment} from "../../api/appointmentsApi";
import {getPatientForDropdown} from "../../mapper/patientMapper";
import moment from "moment";
import {getDuration, getYesterday} from "../../helper";
import {MINUTES, RECURRING_APPOINTMENT_TYPE, WALK_IN_APPOINTMENT_TYPE} from "../../constants";
import AppointmentPlan from "../AppointmentPlan/AppointmentPlan.jsx";
import Label from "../Label/Label.jsx";
import {
    currentTimeSlot,
    dateText,
    editAppointment,
    recurringDetailsEdit,
    recurringEndDateContainer
} from './EditAppointment.module.scss'
import TimeSelector from "../TimeSelector/TimeSelector.jsx";
import InputNumber from "../InputNumber/InputNumber.jsx";
import ButtonGroup from "../ButtonGroup/ButtonGroup.jsx";
import {getWeekDays, selectWeekDays} from "../../services/WeekDaysService/WeekDaysService";
import AppointmentNotes from "../AppointmentNotes/AppointmentNotes.jsx";
import AppointmentEditorFooter from "../AppointmentEditorFooter/AppointmentEditorFooter.jsx";
import {getProviderDropDownOptions} from "../../mapper/providerMapper";
import CalendarPicker from "../CalendarPicker/CalendarPicker.jsx";
import AppointmentDatePicker from "../DatePicker/DatePicker.jsx";
import {capitalize} from "lodash/string";
import CustomPopup from "../CustomPopup/CustomPopup.jsx";
import Conflicts from "../Conflicts/Conflicts.jsx";
import {
    getAppointmentConflicts,
    saveAppointment
} from "../../services/AppointmentsService/AppointmentsService";
import {getDateTime, isStartTimeBeforeEndTime} from "../../utils/DateUtil";
import SuccessConfirmation from "../SuccessModal/SuccessModal.jsx";
import UpdateConfirmationModal from "../UpdateConfirmationModal/UpdateConfirmationModal.jsx";


const EditAppointment = props => {

    const {appConfig, appointmentUuid, isRecurring} = props;

    const [errors, setErrors] = useState({
        patientError: false,
        serviceError: false,
        appointmentDateError: false,
        startDateError: false,
        endDateError: false,
        endDateTypeError: false,
        occurrencesError: false,
        startTimeError: false,
        endTimeError: false,
        recurrencePeriodError: false,
        startTimeBeforeEndTimeError: false,
        weekDaysError: false
    });

    const initialAppointmentState = {
        patient: undefined,
        providers: [],
        service: undefined,
        serviceType: undefined,
        location: undefined,
        speciality: undefined,
        appointmentDate: undefined,
        startTime: undefined,
        endTime: undefined,
        appointmentKind: undefined,
        appointmentType: isRecurring === 'true' ? RECURRING_APPOINTMENT_TYPE : undefined,
        recurringStartDate: undefined,
        recurringEndDate: undefined,
        notes: undefined,
        recurrenceType: undefined,
        occurrences: undefined,
        period: undefined,
        weekDays: undefined
    };

    const [appointmentDetails, setAppointmentDetails] = useState(initialAppointmentState);
    const [conflicts, setConflicts] = useState();
    const [showUpdateConfirmPopup, setShowUpdateConfirmPopup] = useState(false);
    const [showUpdateSuccessPopup, setShowUpdateSuccessPopup] = useState(false);
    const [currentStartTime, setCurrentStartTime] = useState();
    const [currentEndTime, setCurrentEndTime] = useState();
    const isRecurringAppointment = () => appointmentDetails.appointmentType === RECURRING_APPOINTMENT_TYPE;
    const [showUpdateOptions, setShowUpdateOptions] = useState(false);


    const updateErrorIndicators = errorIndicators => setErrors(prevErrors => {
        return {...prevErrors, ...errorIndicators}
    });

    const updateAppointmentDetails = modifiedAppointmentDetails => setAppointmentDetails(prevAppointmentDetails => {
        return {...prevAppointmentDetails, ...modifiedAppointmentDetails}
    });

    //TODO To be checked if can be moved to common place
    const endTimeBasedOnService = (time, service, serviceType) => {
        const currentTime = moment(time);
        const duration = getDuration(service, serviceType);
        currentTime.add(duration, MINUTES);
        if (time) {
            updateAppointmentDetails({endTime: currentTime});
            updateErrorIndicators({endTimeError: false});
        }
    };

    const saveAppointments = () => {
        if (isRecurringAppointment()) {

        } else {
            setShowUpdateConfirmPopup(true);
            // save(getAppointmentRequest()).then();
        }
    };

    const savePopup = <CustomPopup style={customPopup}
                                   popupContent={
                                       <SuccessConfirmation isEdit={true} patientDetails={appointmentDetails.patient && `${appointmentDetails.patient.value.name} (${appointmentDetails.patient.value.identifier})`}/>}/>;

    const updateConfirmPopup = <CustomPopup style={customPopup} onClose={() => setShowUpdateConfirmPopup(false)}
                                            popupContent={
                                                <UpdateConfirmationModal
                                                    isRecurring={appointmentDetails.appointmentType === RECURRING_APPOINTMENT_TYPE}
                                                    onClose={() => setShowUpdateConfirmPopup(false)}
                                                    save={() => {
                                                        setShowUpdateConfirmPopup(false);
                                                        console.log("save clicked");
                                                    }}/>}/>;

    const getAppointmentRequest = () => {
        let appointment = {
            uuid: appointmentUuid,
            patientUuid: appointmentDetails.patient && appointmentDetails.patient.value.uuid,
            serviceUuid: appointmentDetails.service && appointmentDetails.service.value.uuid,
            serviceTypeUuid: appointmentDetails.serviceType && appointmentDetails.serviceType.value &&
                appointmentDetails.serviceType.value.uuid,
            startDateTime: isRecurringAppointment()
                ? getDateTime(appointmentDetails.recurringStartDate, appointmentDetails.startTime)
                : getDateTime(appointmentDetails.appointmentDate, appointmentDetails.startTime),
            endDateTime: isRecurringAppointment()
                ? getDateTime(appointmentDetails.recurringStartDate, appointmentDetails.endTime)
                : getDateTime(appointmentDetails.appointmentDate, appointmentDetails.endTime),
            providers: appointmentDetails.providers,
            locationUuid: appointmentDetails.location && appointmentDetails.location.value.uuid,
            appointmentKind: appointmentDetails.appointmentKind,
            comments: appointmentDetails.notes
        };
        if (!appointment.serviceTypeUuid || appointment.serviceTypeUuid.length < 1)
            delete appointment.serviceTypeUuid;
        return appointment;
    };

    const checkAndSave = async () => {
        if (isValidAppointment()) {
            const appointment = getAppointmentRequest();
            const response = await getAppointmentConflicts(appointment);
            if (response.status === 204) {
                setShowUpdateConfirmPopup(true);
            }
            response.status === 200 && setConflicts(response.data);
        }
    };

    const showSuccessPopUp = () => setShowUpdateSuccessPopup(true);

    const save = async appointmentRequest => {
        const response = await saveAppointment(appointmentRequest);
        if (response.status === 200) {
            setConflicts(undefined);
            showSuccessPopUp(appointmentDetails.appointmentDate);
        }
    };

    const isValidAppointment = () => {
        const startTimeBeforeEndTime = isStartTimeBeforeEndTime(appointmentDetails.startTime, appointmentDetails.endTime);
        updateCommonErrorIndicators(startTimeBeforeEndTime);
        updateErrorIndicators({appointmentDateError: !appointmentDetails.appointmentDate});
        return appointmentDetails.service && appointmentDetails.appointmentDate && appointmentDetails.startTime && appointmentDetails.endTime && startTimeBeforeEndTime;
    };

    const updateCommonErrorIndicators = (startTimeBeforeEndTime) => updateErrorIndicators({
        serviceError: !appointmentDetails.service,
        startTimeError: !appointmentDetails.startTime,
        endTimeError: !appointmentDetails.endTime,
        startTimeBeforeEndTimeError: !startTimeBeforeEndTime
    });

    const generateAppointmentDetails = async () => {
        const appointment = isRecurringAppointment()
            ? await getRecurringAppointment(appointmentUuid) : await getAppointment(appointmentUuid);
        const appointmentResponse = isRecurringAppointment()
            ? (appointment && appointment.data && appointment.data.appointmentDefaultResponse) || undefined
            : (appointment && appointment.data && appointment.data) || undefined;
        const recurringPattern = isRecurringAppointment()
            ? (appointment && appointment.data && appointment.data.recurringPattern) || undefined : undefined;
        if (appointmentResponse) {
            updateAppointmentDetails({
                patient: getPatientForDropdown(appointmentResponse.patient),
                providers: getProviderDropDownOptions(appointmentResponse.providers),
                service: {label: appointmentResponse.service.name, value: appointmentResponse.service},
                serviceType: appointmentResponse.serviceType ? {label: appointmentResponse.serviceType.name, value: appointmentResponse.serviceType} : undefined,
                location: appointmentResponse.location ? {label: appointmentResponse.location.name, value: appointmentResponse.location} : undefined,
                speciality: appointmentResponse.service.speciality.uuid ? {label: appointmentResponse.service.speciality.name, value: appointmentResponse.service.speciality} : undefined,
                startTime: moment(new Date(appointmentResponse.startDateTime)),
                endTime: moment(new Date(appointmentResponse.endDateTime)),
                notes: appointmentResponse.comments,
                appointmentDate: moment(new Date(appointmentResponse.startDateTime)),
                appointmentKind: appointmentResponse.appointmentKind,
                appointmentType: isRecurring === 'true' ? RECURRING_APPOINTMENT_TYPE :
                    appointmentResponse.appointmentKind === WALK_IN_APPOINTMENT_TYPE ? WALK_IN_APPOINTMENT_TYPE : undefined
            });
            setCurrentStartTime(moment(new Date(appointmentResponse.startDateTime)).format('hh:mm a'));
            setCurrentEndTime(moment(new Date(appointmentResponse.endDateTime)).format('hh:mm a'));
            if (isRecurringAppointment()) {
                updateAppointmentDetails({
                    recurrenceType: recurringPattern.type,
                    recurringStartDate: moment(new Date(appointmentResponse.startDateTime)),
                    recurringEndDate: recurringPattern.endDate && moment(new Date(recurringPattern.endDate)),
                    occurrences: recurringPattern.frequency,
                    period: recurringPattern.period,
                    weekDays: recurringPattern.daysOfWeek && selectWeekDays(getWeekDays(appConfig && appConfig.startOfWeek), recurringPattern.daysOfWeek)
                });
            }
        }
    };

    const appointmentStartTimeProps = {
        translationKey: 'APPOINTMENT_TIME_FROM_LABEL', defaultValue: 'From',
        placeHolderTranslationKey: 'CHOOSE_TIME_PLACE_HOLDER', placeHolderDefaultMessage: 'Enter time as hh:mm am/pm',
        defaultTime: appointmentDetails.startTime
    };

    const appointmentEndTimeProps = {
        translationKey: 'APPOINTMENT_TIME_TO_LABEL', defaultValue: 'To',
        placeHolderTranslationKey: 'CHOOSE_TIME_PLACE_HOLDER', placeHolderDefaultMessage: 'Enter time as hh:mm am/pm',
        defaultTime: appointmentDetails.endTime
    };

    useEffect(() => {
        generateAppointmentDetails().then();
    }, [appConfig]);

    return (<Fragment>
        <div data-testid="appointment-editor" className={classNames(appointmentEditor, editAppointment)}>
            <SearchFieldsContainer appointmentDetails={appointmentDetails} errors={errors}
                                   updateErrorIndicators={updateErrorIndicators}
                                   endTimeBasedOnService={endTimeBasedOnService}
                                   updateAppointmentDetails={updateAppointmentDetails} appConfig={appConfig}/>
            <div className={classNames(searchFieldsContainer)} data-testid="recurring-plan-checkbox">
                <div className={classNames(appointmentPlanContainer)}>
                    <AppointmentPlan isEdit={true} appointmentType={appointmentDetails.appointmentType}/>
                </div>
            </div>
            <div className={classNames(recurringContainer)}>
                <div className={classNames(recurringContainerLeft)}>
                    <div data-testid="date-selector">
                        <div className={classNames(dateHeading)}><Label translationKey='CHANGE_DATE_TO_LABEL'
                                                                        defaultValue='Change date to'/></div>
                        <AppointmentDatePicker
                            onChange={date => {
                                updateAppointmentDetails({appointmentDate: date});
                                updateErrorIndicators({appointmentDateError: !date});
                            }}
                            onClear={() => updateAppointmentDetails({appointmentDate: undefined})}
                            defaultValue={appointmentDetails.appointmentDate}
                            minDate={getYesterday()}/>
                    </div>
                    <div>
                        <div className={classNames(dateHeading)} ><Label translationKey="CURRENT_TIME_SLOT_LABEL" defaultValue="Current time slot"/></div>
                        <div className={classNames(currentTimeSlot)}>
                            <span>{currentStartTime}</span>
                            <span> to </span>
                            <span>{currentEndTime}</span>
                        </div>
                        <div className={classNames(dateHeading)} ><Label translationKey="APPOINTMENT_TIME_LABEL" defaultValue="Choose a time slot"/></div>
                        <div data-testid="start-time-selector">
                            <TimeSelector {...appointmentStartTimeProps}
                                          onChange={time => {
                                              updateAppointmentDetails({startTime: time});
                                              endTimeBasedOnService(time, appointmentDetails.service, appointmentDetails.serviceType);
                                          }}/>
                        </div>
                        <div data-testid="end-time-selector">
                            <TimeSelector {...appointmentEndTimeProps}
                                          onChange={time => {
                                              updateAppointmentDetails({endTime: time});
                                          }}/>
                        </div>
                    </div>
                    {isRecurringAppointment() ?
                        <div className={classNames(recurringDetailsEdit)}>
                            <div>
                                <div className={classNames(dateHeading)}><Label translationKey="REPEATS_EVERY_LABEL" defaultValue="Repeats every"/></div>
                                <div>
                                    <span>{moment.localeData().ordinal(appointmentDetails.period)} &nbsp; {appointmentDetails.recurrenceType === 'WEEK'
                                        ? <Label translationKey="WEEK_LABEL" defaultValue="Week"/>
                                        : <Label translationKey="DAY_LABEL" defaultValue="Day"/>}</span>
                                </div>
                                <div>
                                    {appointmentDetails.recurrenceType === 'WEEK'
                                        ? <ButtonGroup buttonsList={appointmentDetails.weekDays}/>
                                        : undefined}
                                </div>
                            </div>
                            {appointmentDetails.occurrences
                                ? (<div>
                                    <div className={classNames(dateHeading)}>
                                        <Label translationKey="NUMBER_OF_OCCURRENCE_LABEL"
                                               defaultValue="# of occurrences"/>
                                    </div>
                                    <InputNumber
                                        onOccurrencesChange={value => updateAppointmentDetails({occurrences: value})}
                                        defaultValue={appointmentDetails.occurrences}/>
                                    <Label translationKey="OCCURRENCES_LABEL" defaultValue="Occurrences"/>
                                </div>)
                                : (<div className={classNames(recurringEndDateContainer)}>
                                    <div className={classNames(dateHeading)}>
                                        <Label translationKey="NEW_END_DATE_LABEL" defaultValue="New end date"/>
                                    </div>
                                    <div>
                                        <span>{moment(appointmentDetails.recurringEndDate).format("Do MMMM YYYY")}</span>
                                        <span className={classNames(dateText)}>
                                            {capitalize(moment(appointmentDetails.recurringEndDate).format("dddd"))}
                                        </span>
                                        <span><CalendarPicker date={appointmentDetails.recurringEndDate}/></span>
                                    </div>
                                </div>)}
                        </div> : undefined}
                </div>
                <div className={classNames(recurringContainerRight)}>
                    <div className={classNames(dateHeading)}><Label translationKey="APPOINTMENT_NOTES"
                                                                    defaultValue="Notes"/></div>
                    <AppointmentNotes value={appointmentDetails.notes} onChange={(event) => updateAppointmentDetails({notes: event.target.value})}/>
                </div>
            </div>
            <AppointmentEditorFooter checkAndSave={!isRecurringAppointment() ? checkAndSave : undefined} isEdit={true} showUpdateOptions={showUpdateOptions} />
            {conflicts &&
            <CustomPopup style={conflictsPopup} open={true}
                         closeOnDocumentClick={false}
                         closeOnEscape={true}
                         popupContent={<Conflicts saveAnyway={saveAppointments}
                                                  modifyInformation={() => setConflicts(undefined)}
                                                  conflicts={conflicts} service={appointmentDetails.service}/>}/>}
            {showUpdateSuccessPopup ? React.cloneElement(savePopup, {
                open: true,
                closeOnDocumentClick: false,
                closeOnEscape: false
            }) : undefined}

            {showUpdateConfirmPopup ? React.cloneElement(updateConfirmPopup, {
                open: true,
                closeOnDocumentClick: true,
                closeOnEscape: true
            }) : undefined}

        </div>
    </Fragment>);
};

EditAppointment.propTypes = {
    intl: PropTypes.object.isRequired,
    appConfig: PropTypes.object,
    appointmentUuid: PropTypes.string.isRequired,
    isRecurring: PropTypes.string.isRequired
};

export default injectIntl(EditAppointment);
