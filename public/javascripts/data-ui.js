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

        $('.rdfDialog .addMissingMetricsButton').click(function (event) {
            //Grab the array of missing metrics that's attached to the button
            var missing = $(this).data("missing");
            //Remove the array so the metrics can't be added multiple times
            $(this).data("missing", []);
            //Add the list to the current metrics
            $.fn.odkControl.addSemanticMetric(missing);
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

        $('.aggregateDialog .aggregateExportButton').click(function (event) {
            event.preventDefault();

            $('.aggregateDialog .rdfWarningMessage').hide();

            //Reset lists of missing metrics
            $('.rdfDialog ul').empty();

            //TODO Debug only
            var rdfTemplateConfig = {
                availableMetrics: {
                    0: "Creator",
                    1: "Unit",
                    2: "Characteristic"
                },
                templates: {
                    oboe: {
                        optionalMetrics: {
                            0: "Creator",
                        },
                        requiredMetrics: {
                            0: "Characteristic",
                            1: "Unit"
                        }
                    }
                }
            };

            //Get the RDF-Export metrics from the specified Aggregate server
            /*$.ajax({
                type: 'GET',
                url: protocol + '://' + target + '/rdfTemplateConfig',
                dataType: 'json',
                success: function(rdfTemplateConfig){*/
            var displayingWarning = false;
            //Compare the received metrics with our current metrics, if we're 
            //missing at least one of them give the user the option 
            //to add them before resuming with the upload
            var missingList = [];
            var current = $.fn.odkControl.currentSemanticMetrics();
            for (var property in rdfTemplateConfig.availableMetrics) {
                if (rdfTemplateConfig.availableMetrics.hasOwnProperty(property)) {
                    var metricName = rdfTemplateConfig.availableMetrics[property];
                    if (!current.includes(metricName))
                        missingList.push(metricName);
                }
            }
            if (missingList.length > 0) {
                displayingWarning = true;

                //Display warning message with list of missing metrics
                var $missingMetricsList = $('.rdfDialog .rdfMissingMetricsContainer ul');
                $('.rdfDialog .rdfMissingMetricsContainer .addMissingMetricsButton').data("missing", missingList);
                $missingMetricsList.empty();
                _.each(missingList, function (missing) {
                    $missingMetricsList.append("<li>" + missing + "</li>");
                });                
                $('.rdfDialog .rdfMissingMetricsContainer').show();
            } else{
                $('.rdfMissingMetricsContainer').hide();
            }

            //Check which metrics are missing for which template
            var _missingRequiredMetrics = {};
            var missingMetrics = {};
            var _missingOptionalMetrics = {};
            var $activeControls = $('.workspace .control');
            for(var templateName in rdfTemplateConfig.templates){
                _missingRequiredMetrics[templateName] = [];
                missingMetrics[templateName] = {
                    required: {},
                    optional: {}
                };
                _missingOptionalMetrics[templateName] = [];
                //Check if each control has the metrics attached as a property and has it filled
                $activeControls.each(function(){
                    $control = $(this);
                    
                    //Check if this template has any required metrics
                    if(rdfTemplateConfig.templates[templateName].requiredMetrics != null){
                        //Loop through all required metrics
                        for(var metricNumber in rdfTemplateConfig.templates[templateName].requiredMetrics){
                            var metricName = rdfTemplateConfig.templates[templateName].requiredMetrics[metricNumber];
                            if(!missingMetrics[templateName].required.hasOwnProperty(metricName)){
                                missingMetrics[templateName].required[metricName] = [];
                            }
                            
                            if(!$control.data('odkControl-properties').hasOwnProperty('__semantics__'+metricName)){
                                //Metric isn't even attached as a property
                                missingMetrics[templateName].required[metricName].push($control.data('odkControl-properties').name.value);
                                _missingRequiredMetrics[templateName].push({
                                    control: $control.data('odkControl-properties').name.value,
                                    metric: metricName
                                });

                                displayingWarning = true;
                            } else {
                                //Metric is attached as a property so we have to check if a value has been entered
                                var value = $control.data('odkControl-properties')['__semantics__'+metricName].value;
                                if(value == null || value.trim().length === 0){
                                    //No value has been entered
                                    missingMetrics[templateName].required[metricName].push($control.data('odkControl-properties').name.value);
                                    _missingRequiredMetrics[templateName].push({
                                        control: $control.data('odkControl-properties').name.value,
                                        metric: metricName
                                    });

                                    displayingWarning = true;
                                }
                            }
                        }
                    }
                    //Check if this template has any optional metrics
                    if(rdfTemplateConfig.templates[templateName].optionalMetrics != null){
                        //Loop through all optional metrics
                        for(var metricNumber in rdfTemplateConfig.templates[templateName].optionalMetrics){
                            var metricName = rdfTemplateConfig.templates[templateName].optionalMetrics[metricNumber];
                            if(!missingMetrics[templateName].optional.hasOwnProperty(metricName)){
                                missingMetrics[templateName].optional[metricName] = [];
                            }

                            if(!$control.data('odkControl-properties').hasOwnProperty('__semantics__'+metricName)){
                                //Metric isn't even attached as a property
                                missingMetrics[templateName].optional[metricName].push($control.data('odkControl-properties').name.value);
                                _missingOptionalMetrics[templateName].push({
                                    control: $control.data('odkControl-properties').name.value,
                                    metric: metricName
                                });

                                displayingWarning = true;
                            } else {
                                //Metric is attached as a property so we have to check if a value has been entered
                                var value = $control.data('odkControl-properties')['__semantics__'+metricName].value;
                                if(value == null || value.trim().length === 0){
                                    //No value has been entered
                                    missingMetrics[templateName].optional[metricName].push($control.data('odkControl-properties').name.value);
                                    _missingOptionalMetrics[templateName].push({
                                        control: $control.data('odkControl-properties').name.value,
                                        metric: metricName
                                    });

                                    displayingWarning = true;
                                }
                            }
                        }
                    }
                });
            }

            //Display the lists of missing metrics
            for(var templateName in missingMetrics){
                var missingRequired = missingMetrics[templateName].required;
                var missingOptional = missingMetrics[templateName].optional;

                var $missingRequirementsList = $('.rdfMissingRequirementsList');
                for(var metricName in missingRequired){
                    if(missingRequired[metricName].length > 0){
                        //TODO Probably inefficient
                        var controlListString = missingRequired[metricName].map(function(controlName){
                            return '<li>' + controlName + '</li>';
                        }).join('');
                        $missingRequirementsList.append('<li>'+ 
                            '<b>' + templateName + '</b>' +
                            ' requires ' + 
                            '<b>' + metricName + '</b>' + 
                            ' which is currently missing for ' + 
                            '<ul>' + controlListString + '</ul>' +
                            '</li>');
                    }
                }
                var $missingOptionalsList = $('.rdfMissingOptionalsList');
                for(var metricName in missingOptional){
                    if(missingOptional[metricName].length > 0){
                        //TODO Probably inefficient
                        var controlListString = missingOptional[metricName].map(function(controlName){
                            return '<li>' + controlName + '</li>';
                        }).join('');
                        $missingOptionalsList.append('<li>'+ 
                            '<b>' + templateName + '</b>' +
                            ' can use ' + 
                            '<b>' + metricName + '</b>' + 
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
                
            /*console.log("_missingRequiredMetrics");
            console.log(_missingRequiredMetrics);
            console.log("_missingOptionalMetrics");
            console.log(_missingOptionalMetrics);*/

            //Check if all optional metrics have been filled out

            
            /*},
            error: function(jqXHR, textStatus, errorThrown ){
                console.log("RDF Config request failed: " + textStatus);
                console.log(errorThrown);
                //TODO Resume with usual upload, this error means the aggregate server
                //either doesn't support the RDF-export or it's broken
                triggerFormUpload();
            }
        });*/
        });

        var triggerFormUpload = function(){
            var $loading = $('.aggregateDialog .modalLoadingOverlay');
            var protocol = $('.aggregateInstanceProtocol').val();
            var target = $('.aggregateInstanceName').val();
            $loading.show();
            $('.aggregateDialog .errorMessage').empty().hide();

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
