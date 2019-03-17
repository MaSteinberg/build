/**
 *  data-ui.js - data's sad little sibling
 *    Manages UI for dialogs involving saving/loading
 *    forms.
 */

var dataNS = odkmaker.namespace.load('odkmaker.data');

; (function ($) {
    dataNS.currentForm = null;

    var openForm = function () {
        $('.openDialog .modalLoadingOverlay').fadeIn();
        $.ajax({
            url: '/form/' + $('.openDialog .formList li.selected').attr('rel'),
            dataType: 'json',
            type: 'GET',
            success: function (response, status) {
                odkmaker.data.load(response);
                $('.openDialog').jqmHide();
            },
            error: function (request, status, error) {
                $('.openDialog .errorMessage')
                    .empty()
                    .append('<p>Could not open the form. Please try again in a moment.</p>')
                    .slideDown();
            }
        });
    };

    $(function () {
        // menu events
        $('.menu .newLink').click(function (event) {
            event.preventDefault();
            if (dataNS.clean)
                odkmaker.application.newForm();
            else
                odkmaker.application.confirm('Are you sure? You will lose unsaved changes to the current form.', odkmaker.application.newForm);

        });
        $('.menu .saveLink').click(function (event) {
            event.preventDefault();

            if (odkmaker.auth.currentUser === null) {
                $('.signinDialog').jqmShow();
                return;
            }
            if (odkmaker.data.currentForm === null) {
                $('.saveAsDialog').jqmShow();
                return;
            }

            $.ajax({
                url: '/form/' + odkmaker.data.currentForm.id,
                contentType: 'application/json',
                dataType: 'json',
                type: 'PUT',
                data: JSON.stringify(odkmaker.data.extract()),
                success: function (response, status) {
                    dataNS.currentForm = response;
                    dataNS.clean = true;
                    $.toast('Form saved!');
                },
                error: function (request, status, error) {
                    $.toast('Your form could not be successfully saved at this time. Please try again in a moment.');
                }
            });
        });
        $('.header .menu .saveLocallyLink').click(function (event) {
            event.preventDefault();

            var $form = $('<form action="/binary/save" method="post" target="downloadFrame" />');
            $form
                .append($('<input type="hidden" name="payload"/>').val(JSON.stringify(odkmaker.data.extract())))
                .append($('<input type="hidden" name="filename"/>').val($('h1').text() + '.odkbuild'));
            $form.appendTo($('body'));
            $form.submit();
        });
        $('.header .menu #xlsformLink').click(function (event) {
            event.preventDefault();

            var xhttp = new XMLHttpRequest();
            xhttp.onreadystatechange = function () {
                if ((xhttp.readyState === 4) && (xhttp.status >= 400))
                    $.toast('Something went wrong while exporting. Please try again later.');
                if ((xhttp.readyState !== 4) || (xhttp.status !== 200)) return;

                // take the binary response, create a blob-reference link out of it, and click on it to trigger dl.
                var a = document.createElement('a');
                a.href = window.URL.createObjectURL(xhttp.response);
                a.download = $.sanitizeString($('h1').text()) + '-export.xlsx';
                a.style.display = 'none';

                document.body.appendChild(a);
                a.click();
            };

            // actually send off the form data.
            xhttp.open('POST', '/convert');
            xhttp.setRequestHeader('Content-Type', 'application/json');
            xhttp.responseType = 'blob';
            xhttp.send(JSON.stringify(odkmaker.data.extract()));
        });

        // cleanliness tracking events
        dataNS.clean = true;
        $('.workspace').on('odkControl-added odkControl-removed', function () { dataNS.clean = false; });
        kor.events.listen({ verb: 'properties-updated', callback: function () { dataNS.clean = false; } });

        // modal events
        var $openDialog = $('.openDialog');
        $openDialog.delegate('.formList li', 'click', function (event) {
            event.preventDefault();

            var $this = $(this);
            $this.siblings('li').removeClass('selected');
            $this.addClass('selected');
        });
        $openDialog.find('.openLink').click(function (event) {
            event.preventDefault();
            odkmaker.application.confirmDestruction(openForm);

        });
        $openDialog.delegate('.formList li', 'dblclick', function (event) {
            event.preventDefault();
            openForm();
        });
        $openDialog.delegate('.formList li a.deleteFormLink', 'click', function (event) {
            event.preventDefault();

            var id = $(this).closest('li').attr('rel');
            odkmaker.application.confirm('Are you absolutely sure you want to delete this form? This cannot be undone.', function () { deleteForm(id); });
        });

        var deleteForm = function (id) {
            $openDialog.find('.modalLoadingOverlay').fadeIn();

            $.ajax({
                url: '/form/' + id,
                dataType: 'json',
                type: 'DELETE',
                success: function (response, status) {
                    odkmaker.auth.currentUser.forms = _.reject(odkmaker.auth.currentUser.forms, function (form) {
                        return form.id === id;
                    });
                    $openDialog.find('[rel=' + id + ']').remove();

                    $('.openDialog .errorMessage').empty();
                },
                error: function () {
                    $('.openDialog .errorMessage').empty().append('<p>Something went wrong when trying to delete ' +
                        'that form. Please try again later.');
                },
                complete: function () {
                    $openDialog.find('.modalLoadingOverlay').fadeOut();
                }
            });
        };

        $('.saveAsDialog .saveAsLink').click(function (event) {
            event.preventDefault();
            var title = $('.saveAsDialog #saveAs_name').val();
            if (title === '')
                return false;

            $('.saveAsDialog .errorMessage').slideUp();

            $.ajax({
                url: '/forms',
                contentType: 'application/json',
                dataType: 'json',
                type: 'POST',
                data: JSON.stringify($.extend({}, odkmaker.data.extract(), { title: title })),
                success: function (response, status) {
                    $.toast('Your form has been saved as "' + title + '".');
                    dataNS.currentForm = response;
                    dataNS.clean = true;
                    $('h1').text(title);
                    $('.saveAsDialog').jqmHide();
                },
                error: function (request, status, error) {
                    $('.saveAsDialog .errorMessage')
                        .empty()
                        .append('<p>Could not save the form. Please try again in a moment.</p>')
                        .slideDown();
                }
            });
        });

        var loadFileValid = false;
        var loadFileUploader = new AjaxUpload('loadFileChooseLink', {
            action: '/binary/load',
            name: 'file',
            autoSubmit: false,
            responseType: 'json',
            onChange: function (fileName, ext) {
                $('#loadFile_name').val(fileName);
                loadFileValid = _.isString(ext) && !!ext.match(/^odkbuild$/i);
                $('.loadLocallyDialog .errorMessage')
                    .text('You must choose an ODK Build form (.odkbuild) file!')
                    .toggle(!loadFileValid);
            },
            onSubmit: function () { return loadFileValid; },
            onComplete: function (fileName, response) {
                $('#loadFile_name').val('');

                // we've loaded a file, but we don't want it to be canonical
                // they'll have to save it to get it upstream.
                dataNS.currentForm = null;
                odkmaker.data.load(response);

                $.toast($.h(fileName) + ' has been loaded, but it is unsaved. Please go to ' +
                    'File &raquo; Save if you wish to save it.');
                $('.loadLocallyDialog').jqmHide();
            }
        });
        $('.loadLocallyDialog .loadFileLink').click(function (event) {
            event.preventDefault();
            loadFileUploader.submit();
        });

        $('.exportDialog .downloadLink').click(function (event) {
            event.preventDefault();

            var $form = $('<form action="/download" method="post" target="downloadFrame" />');
            $form
                .append($('<input type="hidden" name="payload"/>').val(dataNS.serialize()))
                .append($('<input type="hidden" name="filename"/>').val($('h1').text() + '.xml'));
            $form.appendTo($('body'));
            $form.submit();
        });

        $('.rdfDialog .addSemPropsButton').click(function (event) {
            //Grab the properties (checkboxes) that were checked by the user
            var $checked = $('.rdfDialog .propertyCheckboxes input:checked');
            $checked.each(function(){
                //Add each checked property
                odkmaker.control.addSemanticProperty($(this).val());
                //Load the autocompletion for the property
                odkmaker.autocompletion.getSemanticAutocompletion($(this).val());
            });
            //Close the dialogs
            $('.rdfDialog').jqmHide();
            $('.aggregateDialog').jqmHide();
        });

        $('.rdfDialog .resumeUploadButton').click(function(event){
            $('.rdfDialog').jqmHide();
            triggerFormUpload();
        });

        $('.rdfDialog .cancelUploadButton').click(function(event){
            $('.aggregateDialog').jqmHide();
        });

        $('.rdfDialog .checkboxControl .checkboxControlSelectAll').click(function(event){
            $('.rdfDialog .propertyCheckboxes input').prop('checked', true);
        });

        $('.rdfDialog .checkboxControl .checkboxControlDeselectAll').click(function(event){
            $('.rdfDialog .propertyCheckboxes input').prop('checked', false);
        });

        $('.aggregateDialog .aggregateExportButton').click(function (event) {
            event.preventDefault();

            $('.aggregateDialog .rdfWarningMessage').hide();

            //Reset lists of missing properties
            $('.rdfDialog ul').empty();

            /*var rdfTemplateConfig = {
                "availableProperties": {
                    "Creator": {
                        "Endpoint": null,
                        "Query": null
                    },
                    "Unit": {
                        "Endpoint": "http://192.168.0.8:7200/repositories/om",
                        "Query": "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\nPREFIX : <http://ecoinformatics.org/oboe/oboe.1.2/oboe.owl#>\nPREFIX om: <http://www.ontology-of-units-of-measure.org/resource/om-2/>\nPREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\n\nSELECT DISTINCT ?uri ?displayName\nWHERE {\n    ?uri rdf:type om:Unit .\n    OPTIONAL{\n        ?uri rdfs:label ?displayName .\n     \tFILTER (lang(?displayName) = 'en')\n    }\n}"
                    },
                    "Characteristic": {
                        "Endpoint": "http://192.168.0.8:7200/repositories/oboe",
                        "Query": "PREFIX oboe-core: <http://ecoinformatics.org/oboe/oboe.1.2/oboe-core.owl#>\nPREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\nPREFIX : <http://ecoinformatics.org/oboe/oboe.1.2/oboe.owl#>\nSELECT DISTINCT ?uri ?displayName\nWHERE {\n\t?uri rdfs:subClassOf oboe-core:Characteristic .\n    FILTER NOT EXISTS {\n        ?sub rdfs:subClassOf ?uri .\n    }\n    OPTIONAL{\n        ?uri rdfs:label ?displayName\n    }\n}"
                    }
                },
                "templates": {
                    "oboe": {
                        "displayName": "Extensible Observation Ontology",
                        "templateProperties": {
                            "optionalProperties": [
                                "Creator"
                            ],
                            "requiredProperties": [
                                "Characteristic",
                                "Unit"
                            ]
                        }
                    }
                }
            };*/
            

            //Get the RDF-Export's semantic properties from the specified Aggregate server       
            var protocol = $('.aggregateInstanceProtocol').val();
            var target = $('.aggregateInstanceName').val();
            
            //Save the protocol and target to later pull the autocompletion from the same server
            odkmaker.application.serverProtocol = protocol;
            odkmaker.application.serverAddress = target;

            /*Show loading icon*/
            var $loading = $('.aggregateDialog .modalLoadingOverlay');
            $loading.show();

            $.ajax({
                type: 'GET',
                url: protocol + '://' + target + '/rdfTemplateConfig',
                dataType: 'json',
                success: function(rdfTemplateConfig){
                    //Hide loading icon
                    $loading.hide();

                    var displayingWarning = false;
                    //Compare the received properties with our current properties, if we're 
                    //missing at least one of them give the user the option 
                    //to add them before resuming with the upload
                    var missingList = [];
                    var current = odkmaker.control.currentSemProperties;
                    for (var property in rdfTemplateConfig.availableProperties) {
                        if (rdfTemplateConfig.availableProperties.hasOwnProperty(property)) {
                            if (!current.includes(property))
                                missingList.push(property);
                        }
                    }
                    if (missingList.length > 0) {
                        displayingWarning = true;
                        /*Display a checkbox for each missing property*/
                        var $checkboxesContainer = $('.rdfDialog .rdfMissingSemPropsContainer .propertyCheckboxes').empty();
                        _.each(missingList, function(missing){
                            var $checkboxContainer = $('<div></div>').addClass('checkboxContainer');
                            var $checkbox = $("<input type='checkbox'>").attr({name: 'semanticProperty', value: missing, id: missing});
                            var $checkboxLabel = $('<label>' + missing + '</label>').attr({for: missing});
                            $checkboxContainer.append($checkbox, $checkboxLabel);
                            $checkboxesContainer.append($checkboxContainer);
                        });

                        /*Display a button for each template*/
                        var $templateButtonContainer = $('.rdfDialog .rdfMissingSemPropsContainer .templateButtons').empty();
                        _.each(rdfTemplateConfig.templates, function(templateConfig, templateIdentifier){
                            $button = $('<a />', {
                                class: 'modalButton',
                                text: templateConfig.displayName,
                                click: function(e){
                                    /*Check all checkboxes that belong to properties that are either
                                    optional or required for the current template*/
                                    function check(prop){
                                        $checkboxesContainer.find('#'+prop).prop('checked', true);
                                    };
                                    _.each(templateConfig.templateProperties.requiredProperties, check);
                                    _.each(templateConfig.templateProperties.optionalProperties, check);
                                }
                            });
                            $templateButtonContainer.append($button);
                        });
                        
                        /*Make container visible*/
                        $('.rdfDialog .rdfMissingSemPropsContainer').show();
                    } else{
                        $('.rdfMissingSemPropsContainer').hide();
                    }

                    //Check which semantic properties are missing for which template
                    var _missingRequiredProps = {};
                    var missingProps = {};
                    var _missingOptionalProps = {};
                    var $activeControls = $('.workspace .control');
                    /*For each template..*/
                    for(var templateName in rdfTemplateConfig.templates){
                        if(rdfTemplateConfig.templates.hasOwnProperty(templateName)){
                            _missingRequiredProps[templateName] = [];
                            missingProps[templateName] = {
                                required: {},
                                optional: {}
                            };
                            _missingOptionalProps[templateName] = [];
                            var templateProperties = rdfTemplateConfig.templates[templateName].templateProperties;
                            /*If the template has some required/optional properties*/
                            if(templateProperties){
                                /*For each control...*/
                                $activeControls.each(function(){
                                    $control = $(this);                        
                                    /*Check if this template has any required properties*/
                                    if(templateProperties.requiredProperties){
                                        /*For each required property...*/
                                        for(var i = 0; i < templateProperties.requiredProperties.length; i++){
                                            var propName = templateProperties.requiredProperties[i];
                                            if(!missingProps[templateName].required.hasOwnProperty(propName)){
                                                missingProps[templateName].required[propName] = [];
                                            }

                                            if(!$control.data('odkControl-properties').hasOwnProperty('__semantics__'+propName)){
                                                //Semantic property isn't even attached yet
                                                missingProps[templateName].required[propName].push($control.data('odkControl-properties').name.value);
                                                _missingRequiredProps[templateName].push({
                                                    control: $control.data('odkControl-properties').name.value,
                                                    prop: propName
                                                });
                                                displayingWarning = true;
                                            } else {
                                                //Semantic property is attached so we have to check if a value has been entered
                                                var value = $control.data('odkControl-properties')['__semantics__'+propName].value;
                                                if(value == null || value.trim().length === 0){
                                                    //No value has been entered
                                                    missingProps[templateName].required[propName].push($control.data('odkControl-properties').name.value);
                                                    _missingRequiredProps[templateName].push({
                                                        control: $control.data('odkControl-properties').name.value,
                                                        prop: propName
                                                    });
                                                    displayingWarning = true;
                                                }
                                            }
                                        }
                                    }

                                    /*Check if this template has any optional properties*/
                                    if(templateProperties.optionalProperties){
                                        /*For each optional property...*/
                                        for(var i = 0; i < templateProperties.optionalProperties.length; i++){
                                            var propName = templateProperties.optionalProperties[i];
                                            if(!missingProps[templateName].optional.hasOwnProperty(propName)){
                                                missingProps[templateName].optional[propName] = [];
                                            }

                                            if(!$control.data('odkControl-properties').hasOwnProperty('__semantics__'+propName)){
                                                //Property isn't even attached
                                                missingProps[templateName].optional[propName].push($control.data('odkControl-properties').name.value);
                                                _missingOptionalProps[templateName].push({
                                                    control: $control.data('odkControl-properties').name.value,
                                                    prop: propName
                                                });
                                                displayingWarning = true;
                                            } else {
                                                //Property is attached so we have to check if a value has been entered
                                                var value = $control.data('odkControl-properties')['__semantics__'+propName].value;
                                                if(value == null || value.trim().length === 0){
                                                    //No value has been entered
                                                    missingProps[templateName].optional[propName].push($control.data('odkControl-properties').name.value);
                                                    _missingOptionalProps[templateName].push({
                                                        control: $control.data('odkControl-properties').name.value,
                                                        prop: propName
                                                    });
                                                    displayingWarning = true;
                                                }
                                            }
                                        }
                                    }
                                });
                            }
                        }
                    }

                    //Display the lists of missing semantic properties
                    for(var templateName in missingProps){
                        var missingRequired = missingProps[templateName].required;
                        var missingOptional = missingProps[templateName].optional;

                        var $missingRequirementsList = $('.rdfMissingRequirementsList');
                        for(var propName in missingRequired){
                            if(missingRequired[propName].length > 0){
                                //TODO Inefficient?
                                var controlListString = missingRequired[propName].map(function(controlName){
                                    return '<li>' + controlName + '</li>';
                                }).join('');
                                $missingRequirementsList.append('<li>'+ 
                                    '<b>' + templateName + '</b>' +
                                    ' requires ' + 
                                    '<b>' + propName + '</b>' + 
                                    ' which is currently missing for ' + 
                                    '<ul>' + controlListString + '</ul>' +
                                    '</li>');
                            }
                        }
                        var $missingOptionalsList = $('.rdfMissingOptionalsList');
                        for(var propName in missingOptional){
                            if(missingOptional[propName].length > 0){
                                //TODO Probably inefficient
                                var controlListString = missingOptional[propName].map(function(controlName){
                                    return '<li>' + controlName + '</li>';
                                }).join('');
                                $missingOptionalsList.append('<li>'+ 
                                    '<b>' + templateName + '</b>' +
                                    ' can use ' + 
                                    '<b>' + propName + '</b>' + 
                                    ' which is currently missing for ' + 
                                    '<ul>' + controlListString + '</ul>' +
                                    '</li>');
                            }
                        }
                    }

                    if(displayingWarning){
                        $('.rdfDialog').jqmShow();
                    } else{
                        //Everything is okay, resume with the actual upload  
                        triggerFormUpload();
                    }
                },
                error: function(jqXHR, textStatus, errorThrown ){
                    console.error("RDF Configuration request failed: " + textStatus);
                    console.error("Resuming upload without checking for missing semantics");
                    //Hide loading icon (will be reactivated by triggerFormUpload())
                    $loading.hide();
                    //Resume with usual upload, this error means the aggregate server
                    //either doesn't support the RDF-export or it's broken
                    triggerFormUpload();
                },
                timeout: 5000
            });
        });

        var triggerFormUpload = function(){
            var $loading = $('.aggregateDialog .modalLoadingOverlay');
            $loading.show();
            $('.aggregateDialog .errorMessage').empty().hide();
            
            var protocol = $('.aggregateInstanceProtocol').val();
            var target = $('.aggregateInstanceName').val();
            $.ajax({
                url: '/aggregate/post',
                dataType: 'json',
                type: 'POST',
                data: { protocol: protocol, target: target, credentials: { user: $('#aggregateUser').val(), password: $('#aggregatePassword').val() }, name: $('h1').text(), payload: odkmaker.data.serialize() },
                success: function (response, status) {
                    $.toast('Your form has been successfully uploaded to ' + $.h(target) + '.');
                    $('.aggregateDialog').jqmHide();
                },
                error: function (xhr, status, error) {
                    var errorBody = $.parseJSON(xhr.responseText);
                    var message;
                    if (errorBody.code == '400')
                        message = '<p>Could not upload the form. Aggregate could not validate the form contents. Please make sure your form is valid and try again.</p>';
                    else if (errorBody.code == '404')
                        message = '<p>Could not upload the form, because we could not find the Aggregate server you specified. Please check the address and try again.</p>';
                    else if (errorBody.code == 'ECONNREFUSED')
                        message = '<p>Could not upload the form. We found the server you specified, but it does not appear to be a valid, functioning Aggregate server. Please check the address and the server, and try again.</p>';
                    else
                        message = '<p>Could not upload the form. Please check your credentials and instance name, and try again.</p>';

                    $('.aggregateDialog .errorMessage')
                        .empty()
                        .append(message)
                        .slideDown();
                },
                complete: function () { $loading.hide(); }
            });
        }

        $('.formPropertiesDialog .jqmClose').on('click', function () {
            // this codebase is really starting to wear. we have to clear out this field
            // if it is identical to the main title so it doesn't get picked up.
            var $input = $('#formProperties_title');
            if ($input.val() === $('h1').text()) $input.val('');
        });
    });
})(jQuery);
